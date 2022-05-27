import { expect } from '@jest/globals';
import { keys, omit, values } from 'lodash';
import { emptyPosition, LOC_DELIM, PrimaryTaskInstance, Task, taskLocationStr } from '../Task';
import { emptyTask, emptyTaskInstance } from '../Task/Task';
import {
    baseDate,
    createPositionAtLine,
    createTestTask,
    createTestTaskInstance,
    filePaths,
    taskIds,
    taskNames,
    taskUids
} from '../TestHelpers';
import { addFileTaskInstances, buildStateFromInstances, createTask, deleteTaskUids } from './TaskStore';
import { TaskInstanceIndex, TaskStoreState } from './types';


describe( 'task creation', () => {

    test( 'Test create task for empty state', () => {
        const task: Task = {
            ...emptyTask(),
            name: 'default task',
            uid: 1,
        };
        const newState = createTask( {
            ...emptyTaskInstance(),
            ...task
        }, {} )
        expect( newState ).toStrictEqual( {
            taskIndex: {
                1: {
                    id: '1',
                    uid: 1,
                    name: 'default task',
                    parentUids: [],
                    childUids: [],
                    created: new Date( 0 ),
                    updated: new Date( 0 ),
                    complete: false,
                    description: '',
                    instances: []
                }
            },
            instanceIndex: {}
        } as TaskStoreState )
    } );

    test( 'Create task with instances for empty state', () => {
        const pathStrings = filePaths.slice( 0, 3 )
            .map( filePath => taskLocationStr( { filePath, parent: -1, position: emptyPosition( 0 ) } ) );
        const instances = filePaths.slice( 0, 3 ).reduce( ( idx, fp, i ) => ({
            ...idx,
            [ pathStrings[ i ] ]: {
                ...emptyTaskInstance(),
                filePath: fp,
                name: taskNames[ 0 ],
                id: taskIds[ 0 ],
                uid: taskUids[ 0 ],
            }
        }), {} as TaskInstanceIndex );
        const tasks = values( instances );
        const primary: PrimaryTaskInstance = {
            ...tasks[ 0 ],
            primary: true,
            updated: baseDate,
            created: new Date( baseDate ),
            uid: taskUids[ 0 ],
        };
        primary.created.setDate( baseDate.getDate() - 1 )
        tasks[ 0 ] = primary;

        const state = createTask( tasks[ 0 ], {} );
        expect( state ).toStrictEqual( {
            taskIndex: {
                100001: {
                    id: (100001).toString( 16 ),
                    complete: false,
                    uid: 100001,
                    name: 'task number 1',
                    parentUids: [],
                    childUids: [],
                    description: '',
                    updated: new Date( "5/18/2022, 2:00:00 PM" ),
                    created: new Date( (new Date( "5/18/2022, 2:00:00 PM" )).getTime() - (24 * 60 * 60 * 1000) ),
                    instances: []
                }
            },
            instanceIndex: filePaths.slice( 0, 3 ).reduce( ( idx, filePath, i ) => ({
                ...idx,
                [ pathStrings[ i ] ]: instances[ pathStrings[ i ] ]
            }), {} as TaskInstanceIndex )
        } as TaskStoreState )
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
        const initialState: TaskStoreState = {
            taskIndex: {
                44: createTestTask( 44 ),
            },
            instanceIndex: {
                [ `file/path1.md${LOC_DELIM}1` ]: createTestTaskInstance( 44, emptyPosition( 1 ) ),
                [ `file/path1.md${LOC_DELIM}10` ]: createTestTaskInstance( 44, emptyPosition( 10 ) )
            }
        };
        const newInstances = deleteTaskUids( [ 43 ], values( initialState.instanceIndex ) );
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
            [ taskLocStr ]: createTestTaskInstance( 1, createPositionAtLine( 1 ) ),
        }
        const newInstances = addFileTaskInstances( values( fileInstIndex ), [] );
        const newState = buildStateFromInstances( newInstances );
        expect( 1 in newState.taskIndex ).toBeTruthy();
        expect( filePath in newState.instanceIndex ).toBeTruthy();
        expect( 1 in newState.instanceIndex[ filePath ] ).toBeTruthy();
        expect( newState.taskIndex[ 1 ].name ).toEqual( newState.instanceIndex[ taskLocStr ].name )
        expect( newState.taskIndex[ 1 ].id ).toEqual( newState.instanceIndex[ taskLocStr ].id )
    } );

    test( 'Single task instance, all existing', () => {
        const initialState: TaskStoreState = {
            taskIndex: {
                44: createTestTask( 44 ),
            },
            instanceIndex: {
                [ `file/path1.md${LOC_DELIM}4` ]: createTestTaskInstance( 44, emptyPosition( 4 ) ),
                [ `file/path2.md${LOC_DELIM}10` ]: createTestTaskInstance( 44, emptyPosition( 25 ) ),
            }
        };
        const newInstnaces = addFileTaskInstances(
            [ createTestTaskInstance( 44, emptyPosition( 25 ) ) ],
            values( initialState.instanceIndex ) );
        const newState = buildStateFromInstances( newInstnaces );

        expect( newState.taskIndex ).toStrictEqual( {
            ...initialState.taskIndex,
            ...keys( initialState.taskIndex ).reduce( ( idx, k ) => ({
                ...idx,
                [ Number.parseInt( k ) ]: {
                    ...omit( initialState.taskIndex[ Number.parseInt( k ) ], 'instances' ),
                    uid: initialState.taskIndex[ Number.parseInt( k ) ].uid,
                }
            }), {} ),
        } )
        expect( newState.instanceIndex ).toStrictEqual( {
            ...initialState.instanceIndex,
            ...keys( initialState.instanceIndex ).reduce( ( idx, path ) => ({
                ...idx,
                [ path ]: keys( initialState.instanceIndex[ path ] ).reduce( ( fidx, line ) => ({
                    ...fidx,
                    [ line ]: {
                        ...initialState.instanceIndex[ `${path}${LOC_DELIM}${Number.parseInt( line )}` ],
                    }
                }), {} as TaskInstanceIndex )
            }), {} )
        } )
    } );

    test( 'Single new task from instance', () => {
        const testInstance = createTestTaskInstance( 0, emptyPosition( 0 ) );
        const newInstances = addFileTaskInstances( [ testInstance ], [] );
        const newState = buildStateFromInstances( newInstances );
        expect( 100001 in newState.taskIndex ).toBeTruthy();
    } );

    test( 'Full single file update (no old instances in same file)', () => {
        const initialState: TaskStoreState = {
            taskIndex: {
                44: createTestTask( 44 ),
                898: createTestTask( 898 ),
                100: createTestTask( 100 ),
            }, instanceIndex: {
                [ `file/path1.md${LOC_DELIM}4` ]: createTestTaskInstance( 44, emptyPosition( 4 ) ),
                [ `file/path1.md${LOC_DELIM}45` ]: createTestTaskInstance( 898, emptyPosition( 45 ) ),
                [ `file/path1.md${LOC_DELIM}100` ]: createTestTaskInstance( 100, emptyPosition( 100 ) ),
                [ `file/path1.md${LOC_DELIM}60` ]: createTestTaskInstance( 44, emptyPosition( 60 ) ),
            }
        };

        const newFileIndex: TaskInstanceIndex = {
            [ `file/path2.md${LOC_DELIM}1` ]: createTestTaskInstance( 0, emptyPosition( 1 ) ),
            [ `file/path1.md${LOC_DELIM}55` ]: createTestTaskInstance( 898, emptyPosition( 55 ) ),
            [ `file/path1.md${LOC_DELIM}110` ]: createTestTaskInstance( 100, emptyPosition( 110 ) ),
            [ `file/path1.md${LOC_DELIM}70` ]: createTestTaskInstance( 44, emptyPosition( 70 ) ),
        };
        const newInstances = addFileTaskInstances( values( newFileIndex ), values( initialState.instanceIndex ) );
        const newState = buildStateFromInstances( newInstances )
        expect( 'file/path2.md' in newState.instanceIndex ).toBeTruthy();
        expect( newState.instanceIndex[ `file/path1.md${LOC_DELIM}1` ] ).toStrictEqual(
            {
                ...createTestTaskInstance( 0, emptyPosition( 1 ) ),
                uid: 899,
                id: (899).toString( 16 )
            } );
        expect( 'file/path1.md' in newState.instanceIndex ).toBeTruthy();
        expect( Object.keys( newState.instanceIndex[ 'file/path1.md' ] ) ).toHaveLength( 3 );
        for ( const k of Object.keys( initialState.instanceIndex[ 'file/path1.md' ] ) ) {
            expect( Number.parseInt( k ) in newState.instanceIndex[ 'file/path1.md' ] ).toBeFalsy();
            if ( Number.parseInt( k ) !== 4 )
                expect( Number.parseInt( k ) + 10 in newState.instanceIndex[ 'file/path1.md' ] ).toBeTruthy();
        }
    } );

    test( 'Update existing task name from instance', () => {
        const ti = createTestTaskInstance( 50, emptyPosition( 4 ) );
        ti.name = 'a new name';
        const newInstances = addFileTaskInstances([ti], []);
        const newState = buildStateFromInstances(newInstances)
        expect( 50 in newState.taskIndex ).toBeTruthy();
        expect( newState.taskIndex[ 50 ].name ).toEqual( 'a new name' );
    } );

} )

describe( 'test store reducer', () => {
} )
