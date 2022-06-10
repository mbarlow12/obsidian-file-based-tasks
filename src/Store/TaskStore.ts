import { keys, omit, values } from 'lodash';
import { EventRef } from "obsidian";
import { RRule } from "rrule";
import { TaskEvents } from "../Events/TaskEvents";
import { ActionType, IndexUpdateAction } from "../Events/types";
import {
    emptyPosition,
    PrimaryTaskInstance,
    Task,
    TaskInstance,
    taskLocationStr,
    taskToFilename,
    TaskUID
} from "../Task";
import { createTaskFromInstance, taskIdToUid, taskInstancesEqual, taskUidToId } from "../Task/Task";
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

const createPrimaryTaskInstance = (
    instance: Task | TaskInstance,
    created = new Date(),
    updated = new Date(),
    tasksDir = DEFAULT_TASKS_DIR,
): PrimaryTaskInstance => {
    const { name, recurrence, tags, complete, uid, dueDate } = instance;
    return {
        name,
        uid,
        filePath: [ tasksDir, taskToFilename( instance ) ].join( '/' ),
        complete,
        id: uid === 0 ? '' : taskUidToId( uid ),
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
    newInstances: TaskInstance[],
    existing: TaskInstance[]
): TaskInstance[] => {
    const newFilePaths = newInstances.map( ni => ni.filePath );
    let nextId = Math.max( ...existing.map( e => e.uid ) ) + 1;
    return [
        ...existing.filter( eInst => !newFilePaths.includes( eInst.filePath ) ),
        ...newInstances.reduce( ( allNewInsts, inst ) => {
            const existingTaskIdx = existing.findIndex( eti => eti.name === inst.name );
            if ( (inst.uid === 0 || inst.id === '') && existingTaskIdx === -1 ) {
                const uid = nextId++;
                return [
                    ...allNewInsts,
                    { ...inst, uid, id: taskUidToId( uid ) },
                    { ...createPrimaryTaskInstance( inst ), uid, id: taskUidToId( uid ) }
                ];
            }
            else {
                const existingTask = existing[ existingTaskIdx ];
                return [ ...allNewInsts, { ...inst, uid: existingTask.uid, id: existingTask.id } ]
            }
        }, [] as TaskInstance[] )
    ];
};

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

const reducer = ( instanceIndex: TaskInstanceIndex, { data, type }: IndexUpdateAction ): TaskInstance[] => {
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
            return addFileTaskInstances( values( data ), values( instanceIndex ) );
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
                ...createTaskFromInstance( instance ),
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
    }
}


export class TaskStore {
    private events: TaskEvents;
    private state: TaskStoreState;
    private static MIN_UID = 100000;
    private fileCacheRef: EventRef;

    constructor( taskEvents: TaskEvents ) {
        this.events = taskEvents;
        this.fileCacheRef = this.events.onFileCacheUpdate( action => {
            const newInstances = reducer( this.state.instanceIndex, action );
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