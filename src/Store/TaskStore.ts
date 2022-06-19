import { keys, omit, pick, values } from 'lodash';
import { EventRef } from "obsidian";
import { RRule } from "rrule";
import { TaskEvents } from "../Events/TaskEvents";
import { ActionType, IndexUpdateAction } from "../Events/types";
import {
    emptyPosition,
    instanceIndexKey,
    PrimaryTaskInstance,
    Task,
    TaskInstance,
    taskLocationStr,
    taskToFilename,
    TaskUID
} from "../Task";
import { createTaskFromInstance, isPrimaryInstance, taskIdToUid, taskInstancesEqual, taskUidToId } from "../Task/Task";
import { IndexTask, TaskInstanceIndex, TaskStoreState } from './types';

export const hashTaskInstance = (
    { name, id, complete, parent, position: { start: { line } } }: TaskInstance
): string => [ line, id, name, complete ? 'x' : ' ', parent ].join( '||' );

export const renderTags = ( tags?: string[] ): string => ``;
export const renderRecurrence = ( rrule?: RRule ): string => ``;
export const renderDueDate = ( dueDate: Date ) => dueDate.toLocaleString();

export const lineTaskToChecklist = ( { complete, name, id, tags, recurrence, dueDate }: TaskInstance ): string => [
    `- [${complete}]`, name, renderTags( tags ), renderDueDate( dueDate ), renderRecurrence( recurrence ), `^${id}`
].join( ' ' );

export const indexTaskFromTask = ( task: Task ): IndexTask => ({
    ...omit( task, 'instances' ),
    id: taskUidToId( task.uid ),
});

const DEFAULT_TASKS_DIR = `tasks`;
const MIN_UID = 100000;

const createPrimaryTaskInstance = (
    instance: Task | TaskInstance,
    tasksDir = DEFAULT_TASKS_DIR,
    created = new Date(),
    updated = new Date(),
): PrimaryTaskInstance => {
    const { name, recurrence, tags, complete, uid, dueDate } = instance;
    const id = uid === 0 ? '' : taskUidToId( uid );
    instance.id = id;
    return {
        name,
        uid,
        filePath: [ tasksDir, taskToFilename( instance ) ].join( '/' ),
        complete,
        id,
        rawText: name,
        parent: -1,
        position: emptyPosition( 0 ),
        primary: true,
        created,
        updated,
        recurrence,
        dueDate,
        tags
    }
};

export const createTask = (
    task: TaskInstance,
    instanceIndex: TaskInstanceIndex
): TaskInstance[] => {
    const instances: TaskInstance[] = [ createPrimaryTaskInstance( task ) ];
    if ( !task.filePath.includes( task.name ) )
        instances.push( task )
    return values( instanceIndex ).concat( ...instances );
};

export const deleteTaskInstanceFile = (
    filePath: string,
    taskInstances: TaskInstance[]
): TaskInstance[] => taskInstances.filter( ti => ti.filePath !== filePath );

export const renameTaskInstanceFile = (
    oldPath: string,
    newPath: string,
    taskInstances: TaskInstance[]
): TaskInstance[] => taskInstances.map( ti => ti.filePath === oldPath ? { ...ti, filePath: newPath } : ti );

export const addFileTaskInstances = (
    fileIndex: TaskInstanceIndex,
    { taskIndex, instanceIndex: existingIndex }: TaskStoreState,
): TaskInstance[] => {
    const existingInstances = values( existingIndex );
    let nextId = (Math.max( ...existingInstances.map( e => e.uid ), 0 ) || MIN_UID) + 1;
    return values( [ ...existingInstances, ...values( fileIndex ) ].reduce( (
        acc,
        instance
    ) => {
        let { uid, id } = instance;
        if ( id === '' || uid === 0 ) {
            uid = findUidFromInstance( instance,
                fileIndex,
                {
                    taskIndex,
                    instanceIndex: existingIndex
                } );
            if ( uid === 0 || (taskIndex[ uid ].complete) )
                uid = nextId++;

            id = taskUidToId( uid );
        }

        const key = instanceIndexKey( instance.filePath, instance.position.start.line );
        acc[ key ] = { ...instance, id, uid };

        if ( uid === nextId - 1 ) {
            const pInst = createPrimaryTaskInstance( acc[ key ] );
            acc[ instanceIndexKey( pInst.filePath, pInst.position.start.line ) ] = pInst;
        }

        return acc;
    }, {} as TaskInstanceIndex ) );
};

const findUidFromInstance = (
    instance: TaskInstance,
    fileIndex: TaskInstanceIndex,
    { taskIndex, instanceIndex }: TaskStoreState
): number => {
    const existingInsts = values( instanceIndex );
    const nameUids: Map<string, number[]> = existingInsts.reduce( ( nUids, inst ) => {
        if ( !nUids.has( inst.name ) )
            nUids.set( inst.name, [ inst.uid ] )
        return nUids.set( inst.name, [ ...(nUids.get( inst.name ) || []), inst.uid ] );
    }, new Map );

    if ( nameUids.has( instance.name ) ) {
        // name exists already
        // if we can match the parent, use that task's uid
        const instParent = fileIndex[ instanceIndexKey( instance.filePath, instance.parent ) ];
        const existingMatchedNameInsts = existingInsts.filter( ( { name: eName } ) => eName === instance.name );
        if ( instParent ) {
            // parent exists in new instances
            // if parent is new, this instance is new
            const parentMatch = existingMatchedNameInsts.find( emnInst => taskIndex[ emnInst.uid ]?.parentUids.includes( instParent.uid ) );
            if ( parentMatch )
                return parentMatch.uid;
        }
        else {
            // parent is -1 or there's no parent task (shouldn't happen), but the name exists already
            // for now, it's a new instance of the same task
            // TODO: use current time, due date, recurrence, tags
            /**
             * there's already an instance for this task
             *  - if existing is complete, this is new
             *  - filter existing by matching parent line or uid
             */
            const currChildren = values( instanceIndex )
                .filter( cInst => cInst.filePath === instance.filePath && cInst.parent === instance.position.start.line );
            const childrenMatches = existingMatchedNameInsts.filter( emnInst => {
                const emnInstChildUids = taskIndex[ emnInst.uid ].childUids;
                const diffChildUids = currChildren.filter( cChild => !emnInstChildUids.includes( cChild.uid ) );
                // if all the children of the unknown task are contained within the children of an existing task
                return diffChildUids.length === 0;
            } );
            if ( childrenMatches.length > 0 )
                return childrenMatches[ 0 ].uid;
        }
    }
    return 0;
}

export const deleteTaskUid = (
    uid: number,
    existing: TaskInstance[],
): TaskInstance[] => existing.filter( ti => ti.uid !== uid );

export const deleteTaskByName = (
    taskName: string,
    existing: TaskInstance[],
): TaskInstance[] => {
    const iToDelete = existing.findIndex( ti => ti.name === taskName );
    if ( iToDelete >= 0 )
        return deleteTaskUid( existing[ iToDelete ].uid, existing );
    return existing;
}

export const deleteTaskUids = (
    uids: number[],
    existing: TaskInstance[],
): TaskInstance[] => existing.filter( ti => !uids.includes( ti.uid ) );

export const modifyTask = (
    task: Task,
    existing: TaskInstance[]
): TaskInstance[] => existing.map( inst => {
    if ( inst.uid === task.uid ) {
        const { name, recurrence, dueDate, tags, complete } = task;
        return {
            ...inst,
            name, recurrence, dueDate, tags, complete,
            ...(inst.primary && { updated: new Date() })
        }
    }
    return inst;
} );


export const taskInstancesFromTask = ( task: Task ): TaskInstance[] => {
    const primary = createPrimaryTaskInstance( task );
    return [ primary, ...task.instances ];
};

const reducer = ( state: TaskStoreState, { data, type }: IndexUpdateAction ): TaskInstance[] => {
    const { instanceIndex } = state;
    const [ uids, names ] = Object.values( instanceIndex )
        .reduce( ( [ iUids, iNames ], iTask ) => {
            return [ [ ...iUids, iTask.uid ], [ ...iNames, iTask.name ] ]
        }, [ [], [] ] as [ number[], string[] ] );
    const nextId = Math.max( ...uids ) + 1;

    switch ( type ) {

        case ActionType.CREATE_TASK:
            if ( data.id === '' && !names.contains( data.name ) ) {
                return createTask( { ...data, uid: data.uid || nextId }, instanceIndex )
            }
            break;

        case ActionType.DELETE_TASK:
            return deleteTaskUid( data.uid, values( instanceIndex ) )

        case ActionType.DELETE_TASKS:
            return deleteTaskUids( data, values( instanceIndex ) );

        case ActionType.MODIFY_TASK:
            if ( data.uid > 0 && uids.contains( data.uid ) ) {
                return modifyTask( data, values( instanceIndex ) )
            }
            else {
                const primary = createPrimaryTaskInstance( data );
                return [
                    ...values( instanceIndex ),
                    ...(data.instances || []),
                    primary,
                ]
            }

        case ActionType.RENAME_FILE:
            return renameTaskInstanceFile( data.oldPath, data.newPath, values( instanceIndex ) )

        case ActionType.DELETE_FILE:
            return deleteTaskInstanceFile( data, values( instanceIndex ) );

        case ActionType.MODIFY_FILE_TASKS:
            return addFileTaskInstances( data, state );
    }

    return values( instanceIndex )
};

export const getTasksFromInstanceIndex = ( instIdx: TaskInstanceIndex ): Record<TaskUID, Task> => {
    validateInstanceIndex( values( instIdx ) );
    const { parents, children } = keys( instIdx )
        .reduce( ( { parents, children }, locStr ) => ({
            parents: {
                ...parents,
                ...(instIdx[ locStr ].parent > -1 && { [ locStr ]: instIdx[ locStr ] })
            },
            children: {
                ...children,
                ...(instIdx[ locStr ].parent > -1 && { [ locStr ]: [ ...children[ locStr ], instIdx[ locStr ].uid ] })
            }
        }), { parents: {}, children: {} } as { parents: TaskInstanceIndex, children: Record<string, number[]> } )

    return keys( instIdx ).reduce( ( uidTaskMap, taskLocStr ) => {
        const instance = instIdx[ taskLocStr ];
        return {
            ...uidTaskMap,
            [ instance.uid ]: {
                ...(uidTaskMap[ instance.uid ] || createTaskFromInstance( instance )),
                ...(isPrimaryInstance( instance ) && pick( instance, 'created', 'updated' )),
                instances: [ ...(uidTaskMap[ instance.uid ]?.instances || []), instance ],
                parentUids: [
                    ...(uidTaskMap[ instance.uid ]?.parentUids || []),
                    parents[ taskLocStr ]
                ].filter( x => x ),
                childUids: [
                    ...(uidTaskMap[ instance.uid ]?.childUids || []),
                    ...(children[ taskLocStr ] || [])
                ]
            }
        };
    }, {} as Record<string, Task> );
}
export const buildStateFromInstances = ( instances: TaskInstance[] ): TaskStoreState => {
    const instanceIndex = instances.reduce( ( idx, inst ) => ({
        ...idx,
        [ taskLocationStr( inst ) ]: inst
    }), {} as TaskInstanceIndex );
    return {
        instanceIndex,
        taskIndex: getTasksFromInstanceIndex( instanceIndex ),
    };
}


export class TaskStore {
    private events: TaskEvents;
    private state: TaskStoreState;
    private fileCacheRef: EventRef;

    constructor( taskEvents: TaskEvents ) {
        this.events = taskEvents;
        this.fileCacheRef = this.events.onFileCacheUpdate( action => {
            const newInstances = reducer( this.state, action );
            this.state = buildStateFromInstances( newInstances );
            this.update();
        } );
    }


    public unload() {
        this.events.off( this.fileCacheRef );
    }

    public getState() {
        return { ...this.state };
    }

    private update() {
        this.notifySubscribers( { ...this.state } )
    }

    private notifySubscribers( data: TaskStoreState ) {
        this.events.triggerIndexUpdated( data )
    }

    initialize( instances: TaskInstance[] ) {
        validateInstanceIndex( instances );
        this.state = buildStateFromInstances( instances.filter(
            ( inst, i, arr ) => arr.findIndex( fInst => taskInstancesEqual( inst, fInst ) ) === i )
        );
    }
}

export const validateInstanceIndex = ( instances: TaskInstance[] ) => {
    const diffIds = instances.filter( inst => inst.uid !== taskIdToUid( inst.id ) );
    if ( diffIds.length )
        throw new Error( 'Task uids and ids must match.' )
};