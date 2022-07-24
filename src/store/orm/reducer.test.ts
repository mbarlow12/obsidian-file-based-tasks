import { createTestSession } from '../../../test/fixtures';
import { dateStr } from '../../../test/testUtils';
import { TaskActionType } from './actions';
import { allTasks, createTask, updateFileInstances } from './index';
import { emptyTaskInstance } from './models';
import { reducerCreator } from './reducer';
import { getTask, taskInstances } from './selectors';

describe( 'Reducer', () => {

    const { state, orm } = createTestSession( { minTaskId: 10000, indexFiles: {} } );
    const taskReducer = reducerCreator( orm, state.taskDb );

    beforeEach( () => {
        const session = orm.mutableSession( state.taskDb );
        session.Task.all().delete();
        session.TaskInstance.all().delete();
        session.Tag.all().delete();

        expect( session.Task.all().exists() ).toEqual( false );
        expect( session.Tag.all().exists() ).toEqual( false );
        expect( session.TaskInstance.all().exists() ).toEqual( false );
        expect( state.taskDb.Tag.items ).toHaveLength( 0 );
        expect( state.taskDb.Task.items ).toHaveLength( 0 );
        expect( state.taskDb.TaskInstance.items ).toHaveLength( 0 );
    } );

    it( 'should create a task with settings id directive', () => {
        const action = createTask( {
            name: 'created task',
        } );
        let taskDb = taskReducer( state, action );
        expect( taskDb.Task.items ).toEqual( [ 10000 ] )

        const action2 = createTask( {
            name: 'created task 2',
        } );
        taskDb = taskReducer( { ...state, taskDb: { ...taskDb } }, action2 );
        expect( taskDb.Task.items ).toEqual( [ 10000, 10001 ] );
    } );

    it( 'should create a task given a new instance', () => {
        const action = updateFileInstances( 'file', {
            [ 1 ]: {
                name: 'task',
                id: 0,
                complete: false,
                line: 1,
                rawText: 'raw',
                parentLine: -1,
                filePath: 'file',
                childLines: [],
                links: [],
                tags: []
            }
        } );
        const end = taskReducer( state, action );
        expect( end.Task.itemsById[ 10000 ] ).toBeTruthy();
        const insts = taskInstances( end, orm )( 10000 );
        if ( !insts ) {
            expect( insts ).toBeTruthy();
            return;
        }
        expect( insts.toRefArray().map( i => i.key ) ).toEqual( [ 'file||1' ] );
    } );

    it( 'should associate an existing task with its instance', () => {
        const action = createTask( {
            name: 'created task',
        } );
        let end = taskReducer( state, action );
        expect( end.Task.items ).toEqual( [ 10000 ] );
        const instAction = updateFileInstances( 'file', {
            [ 1 ]: {
                name: 'task',
                id: 10000,
                complete: false,
                line: 1,
                rawText: 'raw',
                parentLine: -1,
                filePath: 'file',
                childLines: [],
                links: [],
                tags: []
            }
        } );
        end = taskReducer( { ...state, taskDb: end }, instAction );
        expect( end.Task.items ).toEqual( [ 10000 ] );
        const insts = taskInstances( end, orm )( 10000 );
        expect( insts?.toRefArray().map( i => i.key ) ).toEqual( [ 'file||1' ] );
    } );

    it( 'should increment the task appropriately on file update', () => {
        const action = createTask( {
            name: 'created task',
            id: 10005
        } );
        let taskDb = taskReducer( state, action );
        let instAction = updateFileInstances( 'file', {
            [ 1 ]: {
                name: 'task',
                id: 10005,
                complete: false,
                line: 1,
                rawText: 'raw',
                parentLine: -1,
                filePath: 'file',
                childLines: [],
                links: [],
                tags: []
            }
        } );
        taskDb = taskReducer( { ...state, taskDb }, instAction );
        instAction = updateFileInstances( 'file', {
            [ 1 ]: {
                name: 'task',
                id: 10005,
                complete: false,
                line: 1,
                rawText: 'raw',
                parentLine: -1,
                filePath: 'file',
                childLines: [],
                links: [],
                tags: []
            },
            [ 2 ]: {
                name: 'task',
                id: 0,
                complete: false,
                line: 2,
                rawText: 'raw',
                parentLine: -1,
                filePath: 'file',
                childLines: [],
                links: [],
                tags: []
            }
        } );
        taskDb = taskReducer( { ...state, taskDb }, instAction );
        expect( taskDb.Task.items ).toEqual( [ 10005, 10006 ] );
        expect( taskDb.TaskInstance.items ).toEqual( [ 'file||1', 'file||2' ] );
    } );

    it( 'should replace old instance with new ones on file update', () => {
        const action = createTask( {
            name: 'created task',
            id: 10005
        } );
        let taskDb = taskReducer( state, action );
        let instAction = updateFileInstances( 'file', {
            [ 1 ]: {
                name: 'task',
                id: 10005,
                complete: false,
                line: 1,
                rawText: 'raw',
                parentLine: -1,
                filePath: 'file',
                childLines: [],
                links: [],
                tags: []
            }
        } );
        taskDb = taskReducer( { ...state, taskDb }, instAction );
        instAction = updateFileInstances( 'file', {
            [ 2 ]: {
                name: 'task',
                id: 0,
                complete: false,
                line: 2,
                rawText: 'raw',
                parentLine: -1,
                filePath: 'file',
                childLines: [],
                links: [],
                tags: []
            }
        } );
        taskDb = taskReducer( { ...state, taskDb }, instAction );
        expect( taskDb.Task.items ).toEqual( [ 10005, 10006 ] );
        expect( taskDb.TaskInstance.items ).toEqual( [ 'file||2' ] );
        const insts = taskInstances( taskDb, orm )( 10005 );
        expect( insts ).toBeUndefined();
    } );

    it( 'should handle parent completions', () => {
        const instAction = updateFileInstances( 'file', {
            [ 1 ]: {
                name: 'task',
                id: 10005,
                complete: true,
                line: 1,
                rawText: 'raw',
                parentLine: -1,
                filePath: 'file',
                childLines: [],
                links: [],
                tags: []
            },
            [ 2 ]: {
                name: 'task',
                id: 0,
                complete: false,
                line: 2,
                rawText: 'raw',
                parentLine: 1,
                filePath: 'file',
                childLines: [],
                links: [],
                tags: []
            }
        } );
        const taskDb = taskReducer( { ...state }, instAction );
        const t = getTask( taskDb, orm )( 10006 );
        if ( !t ) {
            expect( t ).toBeTruthy();
            return;
        }
        expect( t.complete ).toEqual( true );
        expect( t.completed ).toBeTruthy();
        expect( dateStr( t.completed ) ).toEqual( (dateStr( (new Date()).getTime() )) );
    } );

    it( 'should not change existing completed date', () => {
        state.taskDb = taskReducer( state, createTask( {
            name: 'completed task',
            complete: true,
            completed: new Date( '01/01/2022' ).getTime(),
        } ) );
        state.taskDb = taskReducer( state, updateFileInstances( 'file', {
            [ 1 ]: {
                name: 'completed task',
                filePath: 'file',
                id: 10000,
                line: 1,
                rawText: 'raw',
                parentLine: -1,
                complete: true,
                links: [],
                tags: [],
                childLines: []
            }
        } ) );
        expect( getTask( state.taskDb, orm )( 10000 )?.completed )
            .toEqual( (new Date( '01/01/22' )).getTime() );
    } );

    it( 'should remove completed date if instance set to incomplete', () => {
        state.taskDb = taskReducer( state, createTask( {
            name: 'completed task',
            complete: true,
            completed: new Date( '01/01/2022' ).getTime(),
        } ) );
        state.taskDb = taskReducer( state, updateFileInstances( 'file', {
            [ 1 ]: {
                name: 'completed task',
                filePath: 'file',
                id: 10000,
                line: 1,
                rawText: 'raw',
                parentLine: -1,
                complete: false,
                links: [],
                tags: [],
                childLines: []
            }
        } ) );
        expect( getTask( state.taskDb, orm )( 10000 )?.completed ).toBeUndefined();
    } );

    it( 'should toggle a task complete', () => {
        state.taskDb = taskReducer( state, createTask( {
            name: 'task 1',
        } ) );
        state.taskDb = taskReducer( state, { type: TaskActionType.TOGGLE_COMPLETE, payload: 10000 } );
        expect( getTask( state.taskDb, orm )( 10000 )?.complete ).toEqual( true );
    } );

    it( 'should toggle sub tasks complete', () => {
        state.taskDb = taskReducer( state, createTask( {
            name: 'task 1',
        } ) );
        state.taskDb = taskReducer( state, createTask( {
            name: 'task 2',
            id: 10001,
        } ) );
        state.taskDb = taskReducer( state, createTask( {
            name: 'task 3',
            id: 10002
        } ) );
        expect( allTasks( state.taskDb, orm ).toModelArray().map( t => t.id ) ).toEqual( [ 10000, 10001, 10002 ] )
        let instAction = updateFileInstances( 'file', {
            [ 1 ]: {
                name: 'task 1',
                id: 10000,
                complete: false,
                line: 1,
                rawText: 'raw',
                parentLine: -1,
                filePath: 'file',
                childLines: [],
                links: [],
                tags: []
            },
            [ 2 ]: {
                name: 'task 2',
                id: 10001,
                complete: false,
                line: 2,
                rawText: 'raw',
                parentLine: 1,
                filePath: 'file',
                childLines: [],
                links: [],
                tags: []
            },
            [ 3 ]: {
                name: 'task 3',
                id: 10002,
                complete: false,
                line: 3,
                rawText: 'raw',
                parentLine: 1,
                filePath: 'file',
                childLines: [],
                links: [],
                tags: []
            }
        } );
        state.taskDb = taskReducer( state, instAction );
        state.taskDb = taskReducer( state, { type: TaskActionType.TOGGLE_COMPLETE, payload: 10000 } );
        expect( getTask( state.taskDb, orm )( 10000 )?.complete ).toEqual( true );
        expect( getTask( state.taskDb, orm )( 10001 )?.complete ).toEqual( true );
        expect( getTask( state.taskDb, orm )( 10002 )?.complete ).toEqual( true );
        instAction = updateFileInstances( 'file', {
            [ 1 ]: {
                name: 'task 1',
                id: 10000,
                complete: false,
                line: 1,
                rawText: 'raw',
                parentLine: -1,
                filePath: 'file',
                childLines: [],
                links: [],
                tags: []
            },
            [ 2 ]: {
                name: 'task 2',
                id: 10001,
                complete: false,
                line: 2,
                rawText: 'raw',
                parentLine: 1,
                filePath: 'file',
                childLines: [],
                links: [],
                tags: []
            },
            [ 3 ]: {
                name: 'task 3',
                id: 10002,
                complete: false,
                line: 3,
                rawText: 'raw',
                parentLine: 2,
                filePath: 'file',
                childLines: [],
                links: [],
                tags: []
            }
        } );
        state.taskDb = taskReducer( state, instAction );
        state.taskDb = taskReducer( state, { type: TaskActionType.TOGGLE_COMPLETE, payload: 10000 } );
        expect( getTask( state.taskDb, orm )( 10002 ).complete ).toEqual( true );
    } );

    it( 'should add tags', () => {
        state.taskDb = taskReducer( state, createTask( {
            name: 'task 1',
            tags: [ 't1']
        } ) );
        let tag = orm.session( state.taskDb ).Tag.withId('t1');
        expect(tag.tasks.toRefArray().map(t => t.name)).toEqual(['task 1']);

        state.taskDb = taskReducer( state, updateFileInstances('file1.md', {
            3: {
                ...emptyTaskInstance(),
                name: 'task 1',
                tags: ['t2', 't1'],
                id: 10000,
                filePath: 'file1.md',
                line: 3,
            },
            5: {
                ...emptyTaskInstance(),
                name: 'task 2',
                tags: ['t2', 't3'],
                id: 0,
                filePath: 'file1.md',
                line: 5,
            }
        }));
        const tags = orm.session( state.taskDb ).Tag;
        expect(tags.all().toRefArray()).toHaveLength(3);
        tag = tags.withId('t2');
        const tasks = tag.tasks.toRefArray();
        expect(tasks.map(t => t.name)).toEqual(['task 1', 'task 2']);
    } );
} );