import { IdOrModelLike } from 'redux-orm';
import { createTestSession } from '../../../../test/fixtures';
import { dateStr } from '../../../../test/testUtils';
import { filterUnique } from '../index';
import { instancesKey } from './index';
import { Tag, tagsEqual } from './tag.model';


describe( "Model relationships", () => {
    const { session } = createTestSession();

    beforeEach( () => {
        expect( session.TaskInstance.all().exists() ).toBeFalsy()
        expect( session.Task.all().exists() ).toBeFalsy()
        expect( session.Tag.all().exists() ).toBeFalsy()
    } )

    afterEach( () => {
        session.Task.all().delete();
        session.Tag.all().delete();
        session.TaskInstance.all().delete();
    } )
    it( 'adds a single task to empty state', () => {
        session.Task.create( {
            id: 2,
            name: 'created task',
            complete: false,
        } );

        expect( session.state.Task.items ).toHaveLength( 1 );
        expect( session.Task.withId( 2 ) ).toBeTruthy();
        expect( session.Task.withId( 2 )?.name ).toEqual( 'created task' );
    } );

    it( 'increments to the next id', () => {
        session.Task.create( {
            id: 10000,
            name: 'created task 1',
        } );
        session.Task.create( {
            name: 'created task 2',
        } );
        expect( session.Task.all().toRefArray() ).toHaveLength( 2 );
        expect( session.Task.withId( 10001 ) ).toBeTruthy();

        const task = session.Task.withId( 10000 ) ?? session.Task.create( {
            id: 10000, name: 'created task 1',
        } );
        const d = new Date().getTime();
        task.update( { completed: d } );
        expect( dateStr(task.completed) ).toEqual( dateStr(d) );
        task.update( { completed: undefined } );
        expect( task.completed ).toBeFalsy();
    } );

    it( 'automatically adds instances to task', () => {
        const task = session.Task.create( {
            id: 10000,
            name: 'created task',
        } );
        session.TaskInstance.create( {
            key: instancesKey( 'file', 0 ),
            filePath: 'file',
            line: 0,
            parentLine: -1,
            rawText: '- [ ] created task',
            task: task.id,
        } );
        expect( session.Task.withId( 10000 )?.instances ).toBeTruthy();
        expect( session.Task.withId( 10000 )?.instances?.toRefArray() ).toHaveLength( 1 );
        expect( session.Task.withId( 10000 )?.instances?.at( 0 )?.key ).toEqual( instancesKey( 'file', 0 ) );
    } );

    it( 'creates instances without task', () => {
        session.TaskInstance.create( {
            key: instancesKey( 'file', 0 ),
            filePath: 'file',
            line: 0,
            parentLine: -1,
            rawText: '- [ ] created task',
            task: -1,
        } );

        expect(session.TaskInstance.withId('file||0')).toBeTruthy();
    });

    it( 'handles parents through instances', () => {
        const task = session.Task.create( {
            id: 10000,
            name: 'created task',
        } );
        const parent = session.Task.create( {
            id: 10001,
            name: 'created task parent',
        } );
        session.TaskInstance.create( {
            key: instancesKey( 'file', 1 ),
            filePath: 'file',
            line: 1,
            parentLine: 1,
            rawText: '- [ ] created task',
            task: task.id,
            parent: parent.id,
            parentInstance: instancesKey( 'file', 0 ),
        } );
        session.TaskInstance.create( {
            key: instancesKey( 'file', 0 ),
            filePath: 'file',
            line: 0,
            parentLine: -1,
            rawText: '- [ ] created task parent',
            task: parent.id,
        } );
        expect( session.Task.withId( 10000 )?.parentTasks?.exists() ).toBeTruthy();
        expect( session.Task.withId( 10000 )?.parentTasks?.first()?.id ).toEqual( 10001 );
        expect( session.Task.withId( 10001 )?.subTasks?.first()?.id ).toEqual( 10000 );
    } );

    it( 'handles tags', () => {
        const task = session.Task.create( {
            id: 10001,
            name: 'test task'
        } );
        session.Tag.create( {
            name: 'tag1',
        } );
        session.Tag.create( {
            name: 'tag2'
        } );
        task.update( {
            tags: [ 'tag1' ]
        } );
        expect( session.Tag.withId( 'tag1' )?.tasks?.exists() ).toBeTruthy();
        expect( session.Tag.withId( 'tag1' )?.tasks?.first()?.id ).toEqual( 10001 );

        task.update( {
            tags: filterUnique<IdOrModelLike<Tag>>( [ ...task.tags.all().toModelArray(), 'tag1' ], tagsEqual )
        } );

        const sTask = session.Task.withId( 10001 );
        expect( sTask?.tags?.all().toRefArray().map( t => t.name ) ).toEqual( [ 'tag1' ] );

        session.Tag.filter( t => t.name === 'tag1' ).delete();
        expect( sTask?.tags.all().exists() ).toBeFalsy();

        const task2 = session.Task.create( {
            id: 10002,
            name: 'second test task',
            tags: [ 'tag3' ]
        } );

        expect( session.Tag.exists( { name: 'tag3' } ) ).toBeFalsy();
        expect( task2.tags.exists() ).toBeFalsy();
        session.Tag.create( { name: 'tag3' } );
        expect( task2.tags.all().toRefArray() ).toEqual( [ { name: 'tag3' } ] )
        expect( session.Tag.withId( 'tag3' )?.tasks?.toRefArray().map( t => t.id ) ).toEqual( [ 10002 ] )
        session.Tag.filter( t => t.name === 'tag1' || t.name === 'tag3' ).delete();
        expect( task2.tags.all().exists() ).toEqual( false );
        expect( session.Task.withId( 10001 )?.tags.exists() ).toEqual( false );
    } );

    it( 'handles deleting a task and its instances', () => {
        const task = session.Task.create( {
            id: 10001,
            name: 'test task'
        } );
        session.TaskInstance.create( {
            key: instancesKey( 'file', 1 ),
            filePath: 'file',
            line: 1,
            parentLine: -1,
            rawText: '- [ ] created task',
            task: task.id,
        } );
        session.TaskInstance.create( {
            key: instancesKey( 'file2', 1 ),
            filePath: 'file2',
            line: 1,
            parentLine: -1,
            rawText: '- [ ] created task',
            task: task.id,
        } );
        expect( session.TaskInstance.withId( 'file||1' )?.task.id ).toEqual( 10001 );
        expect( session.TaskInstance.withId( 'file2||1' )?.task.id ).toEqual( 10001 );
        expect( task.instances?.all().toRefArray().map( i => i.key ) ).toEqual( [ 'file||1', 'file2||1' ] );

        task.delete();

        expect( session.TaskInstance.all().exists() ).toBeFalsy();
    } );

    // NOTE: since instances have foreign keys for both their task and their parent task (if any),
    //   deleting a task also deletes all its subtask instances. To keep subtask instances, the relationship
    //   needs to be removed before task deletion in the reducer.
    it( 'handles delete parent tasks', () => {
        const task = session.Task.create( {
            id: 10001,
            name: 'test task'
        } );
        const child = session.Task.create( {
            id: 10002,
            name: 'test task child'
        } );
        const child2 = session.Task.create( {
            id: 10003,
            name: 'created task four'
        } );
        session.TaskInstance.create( {
            key: instancesKey( 'file', 1 ),
            filePath: 'file',
            line: 1,
            parentLine: -1,
            rawText: '- [ ] created task',
            task: task.id,
        } );
        session.TaskInstance.create( {
            key: instancesKey( 'file', 2 ),
            filePath: 'file',
            line: 2,
            parentLine: 1,
            parentInstance: instancesKey( 'file', 1 ),
            rawText: '- [ ] created task',
            task: child.id,
            parent: task.id
        } );
        session.TaskInstance.create( {
            key: instancesKey( 'file', 4 ),
            filePath: 'file',
            line: 4,
            parentLine: -1,
            rawText: '- [ ] created task four',
            task: child2.id,
            parent: task.id
        } );

        expect( task.subTasks?.all()?.toRefArray().map( t => t.id ) ).toEqual( [ 10002, 10003 ] );
        expect( task.subTaskInstances?.all()?.toRefArray().map( t => t.key ) ).toEqual( [ 'file||2', 'file||4' ] );

        session.TaskInstance.withId( 'file||4' )?.update( { parent: undefined } )

        task.delete();

        expect( session.TaskInstance.all().toRefArray() ).toHaveLength( 1 );
        expect( session.Task.withId( 10002 ) ).toBeTruthy();
        expect( session.Task.withId( 10002 )?.parentTasks?.exists() ).toEqual( false );
        expect( session.Task.withId( 10003 ) ).toBeTruthy();
        expect( session.Task.withId( 10003 )?.parentTasks?.exists() ).toEqual( false );
        expect( session.TaskInstance.first()?.parent ).toBeFalsy()
        expect( session.TaskInstance.first()?.parentInstance ).toBeFalsy()
    } );
} );