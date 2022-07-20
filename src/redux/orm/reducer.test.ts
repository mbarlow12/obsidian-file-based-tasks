import { createTestSession } from '../../../test/fixtures';
import { createTask, updateFileInstances } from './index';
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
        expect( t.completedDate ).toBeTruthy();
        expect( t.completedDate?.toDateString() ).toEqual( (new Date()).toDateString() );
    } );

    it( 'should not change existing completed date', () => {
        state.taskDb = taskReducer( state, createTask( {
            name: 'completed task',
            complete: true,
            completedDate: new Date( '01/01/2022' ),
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
        expect( getTask( state.taskDb, orm )( 10000 )?.completedDate?.toDateString() )
            .toEqual( (new Date( '01/01/22' )).toDateString() );
    } );

    it( 'should remove completed date if instance set to incomplete', () => {
        state.taskDb = taskReducer( state, createTask( {
            name: 'completed task',
            complete: true,
            completedDate: new Date( '01/01/2022' ),
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
        expect( getTask( state.taskDb, orm )( 10000 )?.completedDate ).toBeUndefined();
    } );
} );