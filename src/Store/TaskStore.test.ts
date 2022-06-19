import { expect } from '@jest/globals';
import { values } from 'lodash';
import {
    emptyPosition,
    instanceIndexKey,
    LOC_DELIM,
    PrimaryTaskInstance,
    TaskInstance,
    taskLocationFromInstance,
    taskLocationStr
} from '../Task';
import { emptyTaskInstance } from '../Task/Task';
import {
    createPositionAtLine,
    createTestPrimaryTaskInstance,
    createTestTask,
    createTestTaskInstance
} from '../TestHelpers';
import { addFileTaskInstances, buildStateFromInstances, createTask, deleteTaskUids } from './TaskStore';
import { TaskInstanceIndex, TaskStoreState } from './types';


describe( 'task creation', () => {

    test( 'Test create task for empty state', () => {
        const newState = createTask( {
            ...emptyTaskInstance(),
            name: 'default task',
            uid: 1,
            filePath: 'notes/file.md'
        }, {} );
        const expected: PrimaryTaskInstance = {
            id: '1',
            uid: 1,
            name: 'default task',
            complete: false,
            dueDate: undefined,
            recurrence: undefined,
            tags: undefined,
            primary: true,
            rawText: 'default task',
            position: emptyPosition( 0 ),
            parent: -1,
            filePath: 'tasks/default task_1.md',
            created: new Date(),
            updated: new Date()
        }

        expect( newState ).toStrictEqual( [
            expected, {
                id: '1',
                uid: 1,
                filePath: 'notes/file.md',
                name: 'default task',
                position: emptyPosition( 0 ),
                complete: false,
                parent: -1,
                primary: false,
                rawText: ''
            } as TaskInstance
        ] )
    } );
} )

// delete
describe( 'task deletion', () => {
    test( 'Delete single task', () => {
        const initialState: TaskStoreState = {
            taskIndex: {
                44: createTestTask( 44 ),
            },
            instanceIndex: {}
        };
        const newInstances = deleteTaskUids( [ 44 ], values( initialState.instanceIndex ) );
        const newState = buildStateFromInstances( newInstances );
        expect( Object.keys( newState.taskIndex ) ).toHaveLength( 0 );
        expect( Object.keys( newState.instanceIndex ) ).toHaveLength( 0 );
    } );

    test( 'Delete single task and instances', () => {
        const initialState: TaskStoreState = {
            taskIndex: {
                44: createTestTask( 44 ),
            },
            instanceIndex: {
                [ `file/path1.md${LOC_DELIM}1` ]: createTestTaskInstance( 44, emptyPosition( 1 ) ),
                [ `file/path2.md${LOC_DELIM}10` ]: createTestTaskInstance( 44, emptyPosition( 10 ) )
            }
        };
        const newInstances = deleteTaskUids( [ 44 ], values( initialState.instanceIndex ) );
        const newState = buildStateFromInstances( newInstances );
        expect( Object.keys( newState.taskIndex ) ).toHaveLength( 0 );
        expect( Object.keys( newState.instanceIndex ) ).toHaveLength( 0 );
    } );

    test( 'Delete non-existing tasks', () => {
        const instances = [
            createTestPrimaryTaskInstance( 44, emptyPosition( 0 ) ),
            createTestTaskInstance( 44, emptyPosition( 1 ), -1, `file/path1.md` ),
            createTestTaskInstance( 44, emptyPosition( 10 ), -1, `file/path1.md` )
        ];
        const initialState: TaskStoreState = {
                taskIndex: {
                    44: { ...createTestTask( 44 ), instances },
                },
                instanceIndex: {
                    [ `tasks/test task with uid 44_44.md${LOC_DELIM}0` ]: instances[ 0 ],
                    [ `file/path1.md${LOC_DELIM}1` ]: instances[ 1 ],
                    [ `file/path1.md${LOC_DELIM}10` ]: instances[ 2 ]
                }
            }
        ;
        const newInstances = deleteTaskUids( [ 43 ], values( instances ) );
        const newState = buildStateFromInstances( newInstances );
        expect( newState ).toStrictEqual( initialState );
    } );
} );

// test rename file
describe( 'file renaming', () => {

} );
// test delete file
// test modify file tasks

describe( 'file modify tasks', () => {
    test( 'Single task instance, empty index, empty state', () => {
        const filePath = 'path/to/test file.md';
        const taskLocStr = `${filePath}${LOC_DELIM}1`;
        const fileInstIndex: TaskInstanceIndex = {
            [ taskLocStr ]: createTestTaskInstance( 1, createPositionAtLine( 1 ), -1, filePath ),
        }
        const newInstances = addFileTaskInstances( fileInstIndex, { taskIndex: {}, instanceIndex: {} } );
        const newState = buildStateFromInstances( newInstances );
        expect( 1 in newState.taskIndex ).toBeTruthy();
        expect( taskLocStr in newState.instanceIndex ).toBeTruthy();
        expect( newState.instanceIndex[ taskLocStr ].uid ).toEqual( 1 )
        expect( newState.taskIndex[ 1 ].name ).toEqual( newState.instanceIndex[ taskLocStr ].name )
        expect( newState.taskIndex[ 1 ].id ).toEqual( newState.instanceIndex[ taskLocStr ].id )
    } );

    test( 'Single task instance, all existing', () => {
        const initialState: TaskStoreState = {
            taskIndex: {
                44: createTestTask( 44 ),
            },
            instanceIndex: {
                [ `tasks/test task with uid 44_44.md${LOC_DELIM}0` ]: createTestPrimaryTaskInstance( 44, emptyPosition( 0 ) ),
                [ `file/path1.md${LOC_DELIM}4` ]: createTestTaskInstance( 44, emptyPosition( 4 ), -1, `file/path1.md` ),
                [ `file/path2.md${LOC_DELIM}25` ]: createTestTaskInstance( 44, emptyPosition( 25 ), -1, `file/path2.md` ),
            }
        };
        initialState.taskIndex[ 44 ].instances = [ ...values( initialState.instanceIndex ) ];
        const testInst = createTestTaskInstance( 44, emptyPosition( 25 ) );
        const newInstnaces = addFileTaskInstances(
            {
                [ instanceIndexKey( testInst.filePath, testInst.position.start.line ) ]: testInst
            },
            initialState );
        const newState = buildStateFromInstances( newInstnaces );

        expect( newState.taskIndex ).toStrictEqual( {
            ...initialState.taskIndex,
            [ 44 ]: {
                ...initialState.taskIndex[ 44 ],
                instances: [
                    ...initialState.taskIndex[ 44 ].instances, createTestTaskInstance( 44, emptyPosition( 25 ) )
                ]
            }
        } );
        const expTestTask = createTestTaskInstance( 44, emptyPosition( 25 ) );
        expect( newState.instanceIndex ).toStrictEqual( {
            ...initialState.instanceIndex,
            [ taskLocationStr( taskLocationFromInstance( expTestTask ) ) ]: expTestTask
        } );
    } );

    test( 'Single new task from instance', () => {
        const testInstance = createTestTaskInstance( 0, emptyPosition( 0 ) );
        const newInstances = addFileTaskInstances( { [ instanceIndexKey( testInstance.filePath, 0 ) ]: testInstance }, {
            instanceIndex: {},
            taskIndex: {}
        } );
        const newState = buildStateFromInstances( newInstances );
        expect( 100001 in newState.taskIndex ).toBeTruthy();
    } );

    test( 'Full single file update (no old instances in same file)', () => {
        const existingFile = 'file/path1.md';
        const initialState: TaskStoreState = {
            taskIndex: {
                44: createTestTask( 44 ),
                898: createTestTask( 898 ),
                100: createTestTask( 100 ),
            }, instanceIndex: {
                [ `file/path1.md${LOC_DELIM}4` ]: createTestTaskInstance( 44, emptyPosition( 4 ), -1, existingFile ),
                [ `file/path1.md${LOC_DELIM}45` ]: createTestTaskInstance( 898, emptyPosition( 45 ), -1, existingFile ),
                [ `file/path1.md${LOC_DELIM}100` ]: createTestTaskInstance( 100, emptyPosition( 100 ), -1, existingFile ),
                [ `file/path1.md${LOC_DELIM}60` ]: createTestTaskInstance( 44, emptyPosition( 60 ), -1, existingFile ),
            }
        };
        values( initialState.instanceIndex ).map( inst => initialState.taskIndex[ inst.uid ].instances = [
            ...(initialState.taskIndex[ inst.uid ].instances || []),
            inst
        ] );

        const newFilePath = `file/path2.md`;
        const newFileIndex: TaskInstanceIndex = {
            [ `file/path2.md${LOC_DELIM}1` ]: createTestTaskInstance( 0, emptyPosition( 1 ), -1, newFilePath ),
            [ `file/path1.md${LOC_DELIM}55` ]: createTestTaskInstance( 898, emptyPosition( 55 ), -1, existingFile ),
            [ `file/path1.md${LOC_DELIM}110` ]: createTestTaskInstance( 100, emptyPosition( 110 ), -1, existingFile ),
            [ `file/path1.md${LOC_DELIM}70` ]: createTestTaskInstance( 44, emptyPosition( 70 ), -1, existingFile ),
        };
        const newInstances = addFileTaskInstances( newFileIndex, initialState );
        const newState = buildStateFromInstances( newInstances )
        expect( `file/path2.md${LOC_DELIM}1` in newState.instanceIndex ).toBeTruthy();
        expect( newState.instanceIndex[ `file/path2.md${LOC_DELIM}1` ] ).toStrictEqual(
            {
                ...createTestTaskInstance( 0, emptyPosition( 1 ), -1, newFilePath ),
                uid: 899,
                id: (899).toString( 16 )
            } );
        for ( const line of [ 4, 45, 100, 60, 55, 110, 70 ] )
            expect( `file/path1.md${LOC_DELIM}${line}` in newState.instanceIndex ).toBeTruthy();
        expect( Object.keys( newState.instanceIndex ) ).toHaveLength( 10 );
        for ( const k of Object.keys( initialState.instanceIndex[ 'file/path1.md' ] ) ) {
            expect( Number.parseInt( k ) in newState.instanceIndex[ 'file/path1.md' ] ).toBeFalsy();
            if ( Number.parseInt( k ) !== 4 )
                expect( Number.parseInt( k ) + 10 in newState.instanceIndex[ 'file/path1.md' ] ).toBeTruthy();
        }
    } );

    test( 'Update existing task name from instance', () => {
        const ti = createTestTaskInstance( 50, emptyPosition( 4 ) );
        ti.name = 'a new name';
        const newInstances = addFileTaskInstances( {
            [instanceIndexKey(ti.filePath, ti.position.start.line)]: ti
        }, { taskIndex: {}, instanceIndex: {}} );
        const newState = buildStateFromInstances( newInstances )
        expect( 50 in newState.taskIndex ).toBeTruthy();
        expect( newState.taskIndex[ 50 ].name ).toEqual( 'a new name' );
    } );

} )

describe( 'test store reducer', () => {
} )
