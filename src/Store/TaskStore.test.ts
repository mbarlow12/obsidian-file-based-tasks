import { expect, jest } from '@jest/globals';
import { keys, values } from 'lodash';
import { EventRef, Events } from 'obsidian';
import { TaskEvents } from '../Events/TaskEvents';
import { DEFAULT_TASK_MANAGER_SETTINGS } from '../Settings';
import {
    emptyPosition,
    instanceIndexKey,
    LOC_DELIM,
    PrimaryTaskInstance,
    taskFileLocationToStr,
    TaskInstance,
    taskLocationFromInstance,
    taskLocationStr,
    taskLocationStrFromInstance
} from '../Task';
import { emptyTaskInstance, taskUidToId } from '../Task/Task';
import {
    addTestPrimaryTasksToIndex,
    createPositionAtLine,
    createTestInstanceIndex,
    createTestPrimaryTaskInstance,
    createTestTask,
    createTestTaskInstance
} from '../TestHelpers';
import {
    addFileTaskInstances,
    createTask,
    deleteTaskUids,
    findUidFromInstance,
    getTasksFromInstanceIndex,
    TaskStore
} from './TaskStore';
import { TaskInstanceIndex, TaskStoreState } from './types';


const EMPTY_STATE: TaskStoreState = {
    taskIndex: {},
    instanceIndex: {}
};

const mockedEvents = jest.mocked( {
    on( name: string, callback: ( ...data: any ) => any, ctx?: any ): EventRef {
        return {};
    },
    off( name: string, callback: ( ...data: any ) => any ) {
    },
    offref( ref: EventRef ) {
    },
    trigger( name: string, ...data ) {
    },
    tryTrigger( evt: EventRef, args: any[] ) {
    }
} as Events );
const store = new TaskStore( new TaskEvents( mockedEvents ), DEFAULT_TASK_MANAGER_SETTINGS )

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
        const newState = store.buildStateFromInstances( newInstances );
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
        const newState = store.buildStateFromInstances( newInstances );
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
                    [ `tasks/test task with uid 44_2c.md${LOC_DELIM}0` ]: instances[ 0 ],
                    [ `file/path1.md${LOC_DELIM}1` ]: instances[ 1 ],
                    [ `file/path1.md${LOC_DELIM}10` ]: instances[ 2 ]
                }
            }
        ;
        const newInstances = deleteTaskUids( [ 43 ], values( instances ) );
        const newState = store.buildStateFromInstances( newInstances );
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
        const newState = store.buildStateFromInstances( newInstances );
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
                [ `tasks/test task with uid 44_${taskUidToId( 44 )}.md${LOC_DELIM}0` ]: createTestPrimaryTaskInstance( 44, emptyPosition( 0 ) ),
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
        const newState = store.buildStateFromInstances( newInstnaces );

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
        const newState = store.buildStateFromInstances( newInstances );
        expect( 100000 in newState.taskIndex ).toBeTruthy();
        expect( newState.taskIndex[ 100000 ].name ).toEqual( 'test task with uid 0' );
        expect( newState.taskIndex[ 100000 ].instances ).toHaveLength( 2 );
    } );

    test( 'Full single file update (no old instances in same file)', () => {
        const existingFile = 'file/path1.md';
        const pTask44 = createTestPrimaryTaskInstance( 44, emptyPosition( 0 ) );
        const pTask898 = createTestPrimaryTaskInstance( 898, emptyPosition( 0 ) );
        const pTask100 = createTestPrimaryTaskInstance( 100, emptyPosition( 0 ) );
        const pTask200 = createTestPrimaryTaskInstance( 200, emptyPosition( 0 ) );
        const initialState: TaskStoreState = {
            taskIndex: {
                44: createTestTask( 44 ),
                898: createTestTask( 898 ),
                100: createTestTask( 100 ),
                200: createTestTask( 200 )
            }, instanceIndex: {
                [ taskLocationStr( taskLocationFromInstance( pTask44 ) ) ]: pTask44,
                [ taskLocationStr( taskLocationFromInstance( pTask898 ) ) ]: pTask898,
                [ taskLocationStr( taskLocationFromInstance( pTask100 ) ) ]: pTask100,
                [ taskLocationStr( taskLocationFromInstance( pTask200 ) ) ]: pTask200,
                [ `file/path1.md${LOC_DELIM}4` ]: createTestTaskInstance( 44, emptyPosition( 4 ), -1, existingFile ),
                [ `file/path1.md${LOC_DELIM}45` ]: createTestTaskInstance( 898, emptyPosition( 45 ), -1, existingFile ),
                [ `file/path1.md${LOC_DELIM}100` ]: createTestTaskInstance( 100, emptyPosition( 100 ), -1, existingFile ),
                [ `file/path1.md${LOC_DELIM}60` ]: createTestTaskInstance( 44, emptyPosition( 60 ), -1, existingFile ),
                [ `file/path1.md${LOC_DELIM}15` ]: createTestTaskInstance( 200, emptyPosition( 15 ), -1, `file/path2.md` ),
            }
        };
        values( initialState.instanceIndex ).map( inst => initialState.taskIndex[ inst.uid ].instances = [
            ...(initialState.taskIndex[ inst.uid ].instances || []),
            inst
        ] );

        const newFileIndex: TaskInstanceIndex = {
            [ `file/path1.md${LOC_DELIM}55` ]: createTestTaskInstance( 898, emptyPosition( 55 ), -1, existingFile ),
            [ `file/path1.md${LOC_DELIM}110` ]: createTestTaskInstance( 100, emptyPosition( 110 ), -1, existingFile ),
            [ `file/path1.md${LOC_DELIM}70` ]: createTestTaskInstance( 44, emptyPosition( 70 ), -1, existingFile ),
        };
        const newInstances = addFileTaskInstances( newFileIndex, initialState );
        const newState = store.buildStateFromInstances( newInstances )
        for ( const line of [ 55, 110, 70 ] )
            expect( `file/path1.md${LOC_DELIM}${line}` in newState.instanceIndex ).toBeTruthy();
        for ( const line of [ 4, 45, 100, 60 ] )
            expect( `file/path1.md${LOC_DELIM}${line}` in newState.instanceIndex ).toBeFalsy();
        expect( Object.keys( newState.instanceIndex ) ).toHaveLength( 8 );
    } );

    test( 'Update existing task name from instance', () => {
        const ti = createTestTaskInstance( 50, emptyPosition( 4 ) );
        ti.name = 'a new name';
        const newInstances = addFileTaskInstances( {
            [ instanceIndexKey( ti.filePath, ti.position.start.line ) ]: ti
        }, { taskIndex: {}, instanceIndex: {} } );
        const newState = store.buildStateFromInstances( newInstances )
        expect( 50 in newState.taskIndex ).toBeTruthy();
        expect( newState.taskIndex[ 50 ].name ).toEqual( 'a new name' );
    } );

} )

describe( 'test store reducer', () => {
} )

describe( 'find uinque uids', () => {
    test( 'simple return 0 for empty state', () => {
        const initialState: TaskStoreState = { ...EMPTY_STATE };
        const newTaskInstance = createTestTaskInstance( 0, emptyPosition( 5 ) );
        const uid = findUidFromInstance( newTaskInstance, {
            [ taskLocationStrFromInstance( newTaskInstance ) ]: newTaskInstance
        }, initialState );
        expect( uid ).toEqual( 0 );
    } );

    test( 'return zero for different name', () => {
        const fileMap = new Map()
        fileMap.set( 100, [
            taskFileLocationToStr( 'test/file1.md', { position: emptyPosition( 0 ), parent: -1 } ),
        ] );
        const initialIndex = addTestPrimaryTasksToIndex( createTestInstanceIndex( fileMap ) );
        const taskIndex = getTasksFromInstanceIndex( initialIndex );
        const state: TaskStoreState = { instanceIndex: initialIndex, taskIndex };
        const newInstance = createTestTaskInstance( 0, emptyPosition( 10 ), -1, 'test/file/path2.md' );
        newInstance.name = 'a new task name';
        const uid = findUidFromInstance( newInstance, {
            [ taskLocationStrFromInstance( newInstance ) ]: newInstance
        }, state );
        expect( uid ).toEqual( 0 );
    } );

    test( 'return uid for base matching task', () => {
        const fileMap = new Map()
        fileMap.set( 100, [
            taskFileLocationToStr( 'test/file1.md', { position: emptyPosition( 0 ), parent: -1 } ),
        ] );
        const initialIndex = addTestPrimaryTasksToIndex( createTestInstanceIndex( fileMap ) );
        const taskIndex = getTasksFromInstanceIndex( initialIndex );
        const state: TaskStoreState = { instanceIndex: initialIndex, taskIndex };

        const newInstance = createTestTaskInstance( 0, emptyPosition( 10 ), -1, 'test/file/path2.md' );
        newInstance.name = 'test task with uid 100';
        const uid = findUidFromInstance( newInstance, {
            [ taskLocationStrFromInstance( newInstance ) ]: newInstance
        }, state );
        expect( uid ).toEqual( 100 );
    } );

    test( 'uid 0 for different parents', () => {
        const fileMap = new Map();
        fileMap.set( 100, [
            taskFileLocationToStr( 'test/file1.md', { position: emptyPosition( 0 ), parent: -1 } ),
            taskFileLocationToStr( 'test/file2.md', { position: emptyPosition( 5 ), parent: 4 } )
        ] );
        fileMap.set( 99, [
            taskFileLocationToStr( 'test/file2.md', { position: emptyPosition( 4 ), parent: -1 } )
        ] );
        const initialIndex = addTestPrimaryTasksToIndex( createTestInstanceIndex( fileMap ) );
        const taskIndex = getTasksFromInstanceIndex( initialIndex );
        const state: TaskStoreState = { instanceIndex: initialIndex, taskIndex };

        const newFileMap = new Map();
        newFileMap.set( 0, [
            taskFileLocationToStr( 'test/file2.md', { position: emptyPosition( 20 ), parent: -1 } ),
            taskFileLocationToStr( 'test/file2.md', { position: emptyPosition( 21 ), parent: 20 } )
        ] );
        const newFileIndex = createTestInstanceIndex( newFileMap );
        keys( newFileIndex ).forEach( k => {
            const inst = newFileIndex[ k ];
            if ( inst.parent > -1 )
                inst.name = 'test task with uid 100';
        } );
        const uid = findUidFromInstance( values( newFileIndex )[ 1 ], newFileIndex, state );
        expect( uid ).toEqual( 0 );
    } );
} );

describe( 'Index file instances', () => {

    test( 'single task, no children', () => {

    });
} );