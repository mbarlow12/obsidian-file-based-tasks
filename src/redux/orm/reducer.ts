import { ORM } from 'redux-orm';
import { OrmSession } from 'redux-orm/Session';
import { PluginSettings, TaskQuery } from '../settings';
import { PluginState } from '../types';
import {
    instancePropsFromITaskInstance,
    TaskAction,
    TaskActionType,
    taskCreatePropsFromInstance,
    taskCreatePropsFromITask,
    taskUpdatePropsFromITaskInstance
} from './index';
import { instancesKey } from './models';
import { TaskORMSchema, TasksORMSession, TasksORMState } from './schema'
import { filePathInstances, getNextTaskIdAboveMin } from './selectors';
import { ITask, ITaskCreate, ITaskInstance, ITaskInstanceRecord } from './types';

const repopulateIndexFiles = ( session: OrmSession<TaskORMSchema>, indexFiles: Record<string, TaskQuery> ) => {

}

export const reducerCreator = ( orm: ORM<TaskORMSchema>, initialState: TasksORMState ) => (
    state: PluginState,
    action: TaskAction
) => {
    if ( !state )
        return initialState;
    const { settings, taskDb: dbState } = state;
    const session = orm.session( dbState );

    /**
     * how to handle ignored paths on renaming
     * - if both are ignored, we can progress as usual since there won't be anything in state to begin with
     * - if old is ignored and new isn't, then we'll hit a situation where that path should be reindexed
     *      - rename event -> rename instances (no instances) -> store on subscribe
     *      - the new file won't be in the state at all and no cache change happened

     */
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
    for ( const path of paths ) {
        if ( settings.ignoredPaths.includes( path ) )
            return session.state;
    }

    switch ( action.type ) {
        case TaskActionType.CREATE_TASK:
            createTaskReducer(
                action.payload,
                session,
                settings
            );
            break;
        case TaskActionType.UPDATE_FILE_INSTANCES:
            updateFileInstancesReducer( action.payload.path, action.payload.instances, session, settings );
            break;
        case TaskActionType.DELETE_TASK:
            session.Task.withId( typeof action.payload === 'number' ? action.payload : action.payload.id )
            break;
        case TaskActionType.UPDATE_TASK:
            break;
        case TaskActionType.DELETE_FILE:
            deleteFile( dbState, session, action.payload.path, action.payload.data, settings.deleteSubtaskWithTask );
            break;
        case TaskActionType.RENAME_FILE:
            break;
        case TaskActionType.COMPLETE_TASK:
            break;
        case TaskActionType.UNCOMPLETE_TASK:
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
    if ( !task.id || task.id < settings.minTaskId ) {
        task.id = getNextTaskIdAboveMin( session.state, session, settings.minTaskId );
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
    instances: ITaskInstanceRecord,
    session: TasksORMSession,
    settings: PluginSettings
) => {
    const { Task, TaskInstance } = session;
    // delete previous file entries
    TaskInstance.filter( i => i.filePath === path ).delete();

    // handle parent completions, create new tasks for 0 ids
    for ( const key in instances ) {
        const inst = instances[ key ];

        // placeholder instance
        if ( inst.id === -1 ) {
            TaskInstance.create( instancePropsFromITaskInstance( inst ) )
        }

        // parent completions
        let { parentLine } = inst;
        while ( parentLine > -1 ) {
            const parentInstance = instances[ instancesKey( path, parentLine ) ];
            if ( !parentInstance )
                throw new Error( `No parent for ${inst.name} from ${inst.line} to parent ${inst.parentLine}` );
            if ( parentInstance.complete ) {
                inst.complete = parentInstance.complete;
                break;
            }
            parentLine = parentInstance.parentLine;
        }

        // new ids
        let task = Task.withId( inst.id );
        if ( !inst.id || !task ) {
            const nextId = getNextTaskIdAboveMin( session.state, session, settings.minTaskId );
            task = Task.create( {
                ...taskCreatePropsFromInstance( inst ),
                id: Math.max( nextId, inst.id ?? 0 ),
            } );
            inst.id = task.id;
        }
    }

    // create instances & update task
    for ( const key in instances ) {
        const inst = instances[ key ];
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

