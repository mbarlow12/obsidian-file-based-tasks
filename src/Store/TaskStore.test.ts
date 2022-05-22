import { expect } from '@jest/globals';
import { keys, omit, values } from 'lodash';
import { emptyPosition, Task } from '../Task';
import { emptyTask, emptyTaskInstance, getTasksFromInstanceIndex } from '../Task/Task';
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
import { createTask, modifyFileTasks } from './TaskStore';
import { FileTaskInstanceIndex, TaskInstanceIndex, TaskStoreState } from './types';


describe( 'task creation', () => {

    test( 'Test create task for empty state', () => {
        const state: TaskStoreState = { index: {}, instanceIndex: {} }
        const task: Task = {
            ...emptyTask(),
            name: 'default task',
            uid: 1,
        };
        const newState = createTask( task, state )
        expect( newState ).toStrictEqual( {
            index: {
                1: {
                    id: '1',
                    uid: 1,
                    name: 'default task',
                    parentUids: [],
                    childUids: [],
                    created: new Date( 0 ),
                    updated: new Date( 0 ),
                    complete: false,
                    description: ''
                }
            },
            instanceIndex: {}
        } as TaskStoreState )
    } );

    test( 'Create task with instances for empty state', () => {
        const instances = filePaths.slice( 0, 3 ).reduce( ( idx, fp ) => ({
            ...idx,
            [ fp ]: {
                [ taskUids[ 0 ] ]: {
                    ...emptyTaskInstance(),
                    filePath: fp,
                    name: taskNames[ 0 ],
                    id: taskIds[ 0 ],
                    uid: taskUids[ 0 ],
                }
            }
        }), {} as TaskInstanceIndex );
        const tasks = values( getTasksFromInstanceIndex( instances ) );
        tasks[ 0 ].uid = taskUids[ 0 ];
        tasks[ 0 ].updated = baseDate;
        tasks[ 0 ].created = new Date( baseDate )
        tasks[ 0 ].created.setDate( baseDate.getDate() - 1 )

        const state = createTask( tasks[ 0 ], { index: {}, instanceIndex: {} } );
        expect( state ).toStrictEqual( {
            index: {
                100001: {
                    id: (100001).toString( 16 ),
                    complete: false,
                    uid: 100001,
                    name: 'task number 1',
                    parentUids: [],
                    childUids: [],
                    description: '',
                    updated: new Date( "5/18/2022, 2:00:00 PM" ),
                    created: new Date( (new Date( "5/18/2022, 2:00:00 PM" )).getTime() - (24 * 60 * 60 * 1000) )
                }
            },
            instanceIndex: filePaths.slice( 0, 3 ).reduce( ( idx, fp ) => ({
                ...idx,
                [ fp ]: {
                    0: instances[ fp ][ taskUids[ 0 ] ]
                }
            }), {} as TaskInstanceIndex )
        } as TaskStoreState )
    } );
} )

// test delete
// test modify single task
// test rename file
// test delete file
// test modify file tasks

describe( 'file modify tasks', () => {
    test( 'Single task instance, empty index, empty state', () => {
        const initialState: TaskStoreState = { index: {}, instanceIndex: {} };
        const filePath = 'path/to/test file.md';
        const fileInstIndex: TaskInstanceIndex = {
            [ filePath ]: { 1: createTestTaskInstance( 1, createPositionAtLine( 1 ) ) }
        }
        const newState = modifyFileTasks( fileInstIndex, initialState )
        expect( 1 in newState.index ).toBeTruthy();
        expect( filePath in newState.instanceIndex ).toBeTruthy();
        expect( 1 in newState.instanceIndex[ filePath ] ).toBeTruthy();
        expect( newState.index[ 1 ].name ).toEqual( newState.instanceIndex[ filePath ][ 1 ].name )
        expect( newState.index[ 1 ].id ).toEqual( newState.instanceIndex[ filePath ][ 1 ].id )
    } );

    test( 'Single task instance, all existing', () => {
        const initialState: TaskStoreState = {
            index: {
                44: createTestTask( 44 ),
            },
            instanceIndex: {
                'file/path1.md': {
                    4: createTestTaskInstance( 44, emptyPosition( 4 ) ),
                },
                'file/path2.md': {
                    10: createTestTaskInstance( 44, emptyPosition( 25 ) )
                }
            }
        };
        const newState = modifyFileTasks( {
            'file/path2.md': {
                10: createTestTaskInstance( 44, emptyPosition( 25 ) )
            }
        }, initialState );

        expect(newState.index).toStrictEqual({
            ...initialState.index,
            ...keys( initialState.index ).reduce( ( idx, k ) => ({
                ...idx,
                [ Number.parseInt( k ) ]: {
                    ...omit( initialState.index[ Number.parseInt( k ) ], 'instances' ),
                    uid: initialState.index[ Number.parseInt( k ) ].uid,
                }
            }), {} ),
        })
        expect( newState.instanceIndex ).toStrictEqual( {
            ...initialState.instanceIndex,
            ...keys(initialState.instanceIndex).reduce(( idx, path) => ({
                ...idx,
                [path]: keys(initialState.instanceIndex[path]).reduce((fidx, line) => ({
                    ...fidx,
                    [line]: {
                        ...initialState.instanceIndex[path][Number.parseInt(line)],
                    }
                }), {} as FileTaskInstanceIndex)
            }), {})
        } )
    } );

    test( 'Single new task from instance', () => {
        const initialState: TaskStoreState = { index: {}, instanceIndex: {} };
        const testInstance = createTestTaskInstance( 0, emptyPosition( 0 ) );
        const testIdx = {
            [ testInstance.filePath ]: {
                [ testInstance.position.start.line ]: testInstance
            }
        }
        const newState = modifyFileTasks( testIdx, initialState );
        expect( 100001 in newState.index ).toBeTruthy();
    } );

    test( 'Full single file update (no old instances in same file)', () => {
        const initialState: TaskStoreState = {
            index: {
                44: createTestTask( 44 ),
                898: createTestTask( 898 ),
                100: createTestTask( 100 ),
            }, instanceIndex: {
                'file/path1.md': {
                    4: createTestTaskInstance( 44, emptyPosition( 4 ) ),
                    45: createTestTaskInstance( 898, emptyPosition( 45 ) ),
                    100: createTestTaskInstance( 100, emptyPosition( 100 ) ),
                    60: createTestTaskInstance( 44, emptyPosition( 60 ) ),
                },
            }
        };

        const newFileIndex: TaskInstanceIndex = {
            'file/path2.md': {
                1: createTestTaskInstance( 0, emptyPosition( 1 ) )
            },
            'file/path1.md': {
                55: createTestTaskInstance( 898, emptyPosition( 55 ) ),
                110: createTestTaskInstance( 100, emptyPosition( 110 ) ),
                70: createTestTaskInstance( 44, emptyPosition( 70 ) ),
            }
        };

        const newState = modifyFileTasks( newFileIndex, initialState );
        expect( 'file/path2.md' in newState.instanceIndex ).toBeTruthy();
        expect( newState.instanceIndex[ 'file/path2.md' ][ 1 ] ).toStrictEqual(
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
    } );

    test( 'Mixed and misc. test', () => {
    } )
} )

describe( 'test store reducer', () => {
} )
