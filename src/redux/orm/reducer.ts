import { ORM } from 'redux-orm';
import { OrmSession } from 'redux-orm/Session';
import { PluginSettings } from '../settings';
import { PluginState } from '../types';
import {
    fileRecordsEqual,
    IndexFileSettings,
    instancePropsFromITaskInstance,
    instancePropsFromTask,
    iTaskInstance,
    queryToComparer,
    TaskAction,
    TaskActionType,
    taskCreatePropsFromInstance,
    taskCreatePropsFromITask,
    taskUpdatePropsFromITaskInstance,
    ToggleTaskComplete
} from './index';
import { instancesKey } from './models';
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
        const tasks = session.Task.filter( filterFn ).orderBy( 'created' ).toModelArray();
        const seenIds = new Set<number>();
        let line = 0;
        for ( let i = 0; i < tasks.length; i++ ) {
            const task = tasks[ i ];
            if ( seenIds.has( task.id ) )
                continue;
            seenIds.add( task.id );
            const parentInstance = session.TaskInstance.create( instancePropsFromTask( task, filePath, line++ ) );

            if ( task.subTasks.exists() ) {
                const subTasks = task.subTasks.all().toModelArray();
                subTasks.forEach( st => session.TaskInstance.create( {
                    ...instancePropsFromTask( st, filePath, line++ ),
                    parentInstance,
                    parentLine: parentInstance.line
                } ) );
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
    session.Task.create( taskCreatePropsFromITask( task ) );
    if ( task.instances ) {
        task.instances.forEach( i => {
            session.TaskInstance.create( instancePropsFromITaskInstance( i ) )
        } );
    }
}

export const updateFileInstancesReducer = (
    path: string,
    instances: FileITaskInstanceRecord,
    session: TasksORMSession,
    settings: PluginSettings
) => {
    const { Task, TaskInstance } = session;

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
    for ( const lineStr in instances ) {
        const line = Number.parseInt( lineStr );
        const inst = instances[ line ];

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
    task.subTasks.update( { complete, completed } );
}

