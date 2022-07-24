import { ORM } from 'redux-orm';
import { OrmSession } from 'redux-orm/Session';
import { PluginSettings } from '../settings';
import { PluginState } from '../types';
import {
    fileRecordsEqual,
    IndexFileSettings,
    instancePropsFromITaskInstance,
    instancePropsFromTask,
    iTask,
    iTaskInstance,
    queryToComparer,
    subTaskTree,
    TaskAction,
    TaskActionType,
    taskCreatePropsFromInstance,
    taskCreatePropsFromITask,
    taskUpdatePropsFromITaskInstance,
    ToggleTaskComplete
} from './index';
import { instancesKey, MTask, MTaskInstance } from './models';
import { TaskORMSchema, TasksORMSession, TasksORMState } from './schema'
import { filePathInstances } from './selectors';
import { FileITaskInstanceRecord, ITask, ITaskCreate, ITaskInstance } from './types';

export const repopulateIndexFiles = (
    session: OrmSession<TaskORMSchema>,
    indexFiles: IndexFileSettings
) => {

    for ( const filePath in indexFiles ) {
        const { query } = indexFiles[ filePath ];
        const filterFn = queryToComparer( query )
        session.TaskInstance.filter( ti => ti.filePath === filePath ).delete();
        const filteredTasks = session.Task.filter( filterFn )
            .orderBy( 'created' ).toModelArray()
            .filter( mT => !mT.parentTasks.filter( filterFn ).exists() );
        const seenIds = new Set<number>();
        let line = 0;
        for ( let i = 0; i < filteredTasks.length; i++ ) {
            const task = filteredTasks[ i ];
            if ( seenIds.has( task.id ) )
                continue;
            seenIds.add( task.id );
            const currentParent = session.TaskInstance.create( instancePropsFromTask( task, filePath, line++ ) );
            const subTasks = [
                ...task.subTasks.toModelArray()
                    .map( st => [ currentParent, st ] as [ MTaskInstance, MTask ] )
            ];
            while ( subTasks.length > 0 ) {
                const [ parentInstance, subtask ] = subTasks.shift();
                if ( !filterFn( iTask( subtask ) ) )
                    continue;
                const subInst = session.TaskInstance.create( {
                    ...instancePropsFromTask( subtask, filePath, line++ ),
                    parentInstance,
                    parentLine: parentInstance.line
                } );
                subtask.subTasks.toModelArray().forEach( tim => subTasks.unshift( [ subInst, tim ] ) )
            }
        }
    }
}

export const reducerCreator = ( orm: ORM<TaskORMSchema>, initialState: TasksORMState ) => (
    state: PluginState,
    action: TaskAction
) => {
    if ( !state )
        return initialState;
    const { settings, taskDb: dbState } = state;
    const session = orm.session( dbState );

    const paths: string[] = [];
    switch ( action.type ) {
        case TaskActionType.RENAME_FILE:
            paths.push( action.payload.oldPath, action.payload.newPath )
            break
        case TaskActionType.DELETE_FILE:
        case TaskActionType.UPDATE_FILE_INSTANCES:
            paths.push( action.payload.path );
            break
    }
    for ( const path of paths )
        if ( settings.ignoredPaths.includes( path ) ) return session.state;

    switch ( action.type ) {
        case TaskActionType.CREATE_TASK:
            createTaskReducer( action.payload, session, settings );
            break;
        case TaskActionType.UPDATE_FILE_INSTANCES:
            updateFileInstancesReducer( action.payload.path, action.payload.instances, session, settings );
            break;
        case TaskActionType.DELETE_TASK:
            session.Task.withId( typeof action.payload === 'number' ? action.payload : action.payload.id ).delete()
            break;
        case TaskActionType.UPDATE_TASK:
            break;
        case TaskActionType.DELETE_FILE:
            deleteFile( dbState, session, action.payload.path, action.payload.data, settings.deleteSubtaskWithTask );
            break;
        case TaskActionType.RENAME_FILE:
            break;
        case TaskActionType.TOGGLE_COMPLETE:
            toggleComplete( action.payload, session );
            break;
        case TaskActionType.ARCHIVE_TASKS:
            break;
        case TaskActionType.UNARCHIVE_TASKS:
            break;
        case TaskActionType.REHYDRATE:
            break;
    }

    repopulateIndexFiles( session, settings.indexFiles );

    return session.state;
}

const createTaskReducer = (
    task: ITaskCreate,
    session: TasksORMSession,
    settings: PluginSettings
) => {
    if ( !session.Task.first() ) {
        task.id = Math.max( task.id ?? 0, settings.minTaskId );
    }
    const props = taskCreatePropsFromITask( task );
    session.Task.create( props );
    if ( task.instances ) {
        task.instances.forEach( i => {
            session.TaskInstance.create( instancePropsFromITaskInstance( i ) )
        } );
    }
    task.tags.forEach( tag => {
        if ( !session.Tag.withId( tag ) )
            session.Tag.create( { name: tag } );
    } );
}

export const updateFileInstancesReducer = (
    path: string,
    instances: FileITaskInstanceRecord,
    session: TasksORMSession,
    settings: PluginSettings
) => {
    const { Task, TaskInstance, Tag } = session;

    const existing = TaskInstance.filter( i => i.filePath === path ).all().toModelArray()
        .reduce( ( rec, inst ) => ({
            ...rec,
            [ inst.line ]: iTaskInstance( inst )
        }), {} as FileITaskInstanceRecord );

    if ( fileRecordsEqual( instances, existing ) )
        return;

    // delete previous file entries
    TaskInstance.filter( i => i.filePath === path ).delete();

    // handle parent completions, create new tasks for 0 ids
    const lines = Object.keys( instances ).map( k => Number.parseInt( k ) ).sort();
    for ( const line of lines ) {
        const inst = instances[ line ];
        if ( inst.parentLine > -1 ) {
            if ( !inst.parentInstance )
                inst.parentInstance = instances[ inst.parentLine ];
            if ( inst.parentInstance.complete )
                inst.complete = true;
        }

        // placeholder instance
        if ( inst.id === -1 ) {
            continue;
        }

        // new ids
        let task = Task.withId( inst.id );
        if ( !inst.id || !task ) {
            task = Task.create( {
                ...taskCreatePropsFromInstance( inst ),
                ...(!Task.first() && { id: Math.max( inst.id ?? 0, settings.minTaskId ) }),
            } );
            inst.id = task.id;
            inst.tags.forEach( tag => {
                if ( !Tag.withId( tag ) )
                    Tag.create( { name: tag } )
            } );
        }
    }

    // create instances & update task
    for ( const key in instances ) {
        const inst = instances[ key ];
        if ( inst.id === -1 )
            continue;
        TaskInstance.create( instancePropsFromITaskInstance( inst ) );
        const task = Task.withId( inst.id );
        if ( !task )
            throw new Error( `All ids should be valid ${inst.name} ${inst.id} ${inst.filePath}` );
        task.update( taskUpdatePropsFromITaskInstance( inst, task ) );
    }
}

const deleteFile = (
    dbState: TasksORMState,
    session: TasksORMSession,
    path: string,
    data?: ITask | ITaskInstance[] | undefined,
    deleteSubtasks = false,
) => {
    filePathInstances( session.state, session )( path ).delete();
    if ( data ) {
        if ( !Array.isArray( data ) ) {
            const task = session.Task.withId( data.id );
            if ( task ) {
                if ( !deleteSubtasks )
                    task.subTaskInstances?.update( { parent: undefined } );
                task.delete();
            }
        }
        else
            data.forEach( i => session.TaskInstance.withId( instancesKey( i ) )?.delete() )

    }
}

const toggleComplete = ( payload: ToggleTaskComplete['payload'], session: TasksORMSession ) => {
    if ( typeof payload !== 'number' )
        payload = payload.id;
    const task = session.Task.withId( payload );
    if ( !task )
        return;
    const complete = !task.complete;
    const completed = complete ? new Date().getTime() : undefined;
    task.update( { complete, completed } );
    if ( complete ) {
        const subs = subTaskTree( session.state, { session, id: task.id } );
        subs.forEach( st => st.update( { complete } ) );
    }

}

