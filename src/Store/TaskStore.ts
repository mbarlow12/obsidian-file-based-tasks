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
} from "../Task";
import {
    createTaskFromInstance,
    isPrimaryInstance,
    isTask,
    taskIdToUid,
    taskInstancesEqual,
    taskUidToId
} from "../Task/Task";
import { isQueryBlock, Operator, TaskManagerSettings, TaskQuery, TaskQueryBlock } from '../taskManagerSettings';
import { IndexTask, TaskIndex, TaskInstanceIndex, TaskStoreState } from './types';

export const hashTaskInstance = (
    { name, id, complete, parent, position: { start: { line } } }: TaskInstance
): string => [ line, id, name, complete ? 'x' : ' ', parent ].join( '||' );

export const renderTags = ( tags?: string[] ): string => ``;
export const renderRecurrence = ( rrule?: RRule ): string => ``;
export const renderDueDate = ( dueDate: Date ) => dueDate ? dueDate.toLocaleString() : '';

export const taskInstanceToChecklist = ( { complete, name, id, tags, recurrence, dueDate }: TaskInstance ): string => [
    `- [${complete ? 'x' : ' '}]`, name, renderTags( tags ), renderDueDate( dueDate ), renderRecurrence( recurrence ),
    `^${id}`
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
        created: isTask( instance ) ? instance.created : created,
        updated: isTask( instance ) ? instance.updated : updated,
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
): TaskInstance[] => {
    const uidstoDelete = taskInstances.filter( i => i.filePath === filePath )
        .reduce( ( uids, i ) => uids.add( i.uid ), new Set as Set<number> );
    return taskInstances.filter( ti => !uidstoDelete.has( ti.uid ) );
}

export const renameTaskInstanceFile = (
    oldPath: string,
    newPath: string,
    taskInstances: TaskInstance[]
): TaskInstance[] => taskInstances.map( ti => ti.filePath === oldPath ? { ...ti, filePath: newPath } : ti );

export const addFileTaskInstances = (
    fileIndex: TaskInstanceIndex,
    { taskIndex, instanceIndex: existingIndex }: TaskStoreState,
): TaskInstance[] => {
    const paths = Array.from( values( fileIndex ).reduce( ( acc, inst ) => acc.add( inst.filePath ), new Set ) );
    if ( paths.length !== 1 )
        throw new Error( 'All instance from a file must have the same file path.' );
    return [ ...values( existingIndex ).filter( inst => inst.filePath !== paths[ 0 ] ), ...values( fileIndex ) ];
};

export const arraysEqual = <T>( a: T[], b: T[] ): boolean => {
    return a.length === b.length &&
        a.every( ( elem, idx ) => elem === b[ idx ] );
}

export const findUidFromInstance = (
    instance: TaskInstance,
    fileIndex: TaskInstanceIndex,
    { instanceIndex }: TaskStoreState
): number => {
    if ( instance.uid !== 0 )
        return instance.uid;
    if ( instance.id !== '' )
        return taskIdToUid( instance.id );

    const existingInsts = values( instanceIndex );
    const taskIndex = getTasksFromInstanceIndex( instanceIndex );
    const nameUids: Map<string, number[]> = existingInsts.reduce( ( nUids, inst ) => {
        if ( !nUids.has( inst.name ) )
            nUids.set( inst.name, [ inst.uid ] )
        return nUids.set( inst.name, [ ...(nUids.get( inst.name ) || []), inst.uid ] );
    }, new Map );

    if ( nameUids.has( instance.name ) ) {
        const instParent = fileIndex[ instanceIndexKey( instance.filePath, instance.parent ) ];
        const instChildUids = values( fileIndex )
            .filter( child => child.filePath === instance.filePath && child.parent === instance.position.start.line )
            .map( inst => inst.uid );
        return nameUids.get( instance.name ).find( uid => {
            const existingTask = taskIndex[ uid ];
            return (instParent && existingTask.parentUids.length && existingTask.parentUids.includes( instParent.uid ))
                || (instChildUids.length && arraysEqual( existingTask.childUids.sort(), instChildUids.sort() ))
                || (instance.tags?.length && arraysEqual( existingTask.tags, instance.tags ))
                || (!existingTask.parentUids.length && !instParent && !existingTask.childUids.length && !instChildUids.length);
        } ) || 0;
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

export const indexFileInstancesFromTask = ( filePath: string, task: Task, index: TaskIndex, startLine = 0 ) => {
    const useTab = true;
    const tabSize = 4;
    const parent: TaskInstance = {
        ...omit( createPrimaryTaskInstance( task ), 'created', 'updated' ),
        filePath,
        parent: -1,
        position: emptyPosition( startLine ),
    };
    parent.rawText = taskInstanceToChecklist( parent );
    const children: TaskInstance[] = task.childUids.sort().map( ( cuid ): Task => index[ cuid ] )
        .reduce( ( c, child ) => {
            return [
                ...c,
                ...indexFileInstancesFromTask( filePath, child, index, ++startLine )
            ]
        }, [] as TaskInstance[] )
        .map( inst => ({
            ...inst,
            parent: parent.position.start.line,
            position: {
                end: inst.position.end,
                start: {
                    ...inst.position.start,
                    col: inst.position.start.col + (useTab ? 1 : (inst.position.start.col === 0 ? 2 : tabSize))
                }
            }
        }) );
    return [ parent, ...children ];
};

export const createIndexFileTaskInstances = ( filePath: string, taskIndex: TaskIndex ) => {
    const childUids = values(taskIndex).reduce((s, t) => new Set([...s, ...t.childUids]), new Set<number>());
    const allInstances = values( taskIndex )
        .sort( ( a, b ) => a.created.getTime() - b.created.getTime() )
        .reduce( ( instIdx, fTask ) => {
            const instances = indexFileInstancesFromTask(filePath, fTask, taskIndex);
            return [
                ...instIdx,
                ...instances
            ]
        }, [] as TaskInstance[] )
        .filter(inst => inst.parent > -1 || !childUids.has(inst.uid))
        .map((inst, lineNum) => {
            const line = lineNum + inst.position.start.line;
            const parent = inst.parent === -1 ? -1 : lineNum + inst.parent;
            return {
                ...inst,
                parent,
                position: {
                    start: { ...inst.position.start, line },
                    end: { ...inst.position.end }
                }
            };
        });
    return allInstances.reduce((idx, i) => ({ ...idx, [taskLocationStr(i)]: i}), {} as TaskInstanceIndex);
}

export const taskInstancesFromTask = ( task: Task ): TaskInstance[] => {
    const hasPrimary = task.instances.filter( inst => isPrimaryInstance( inst ) ).length === 1;
    if ( hasPrimary )
        return [ ...task.instances ]
    return [ createPrimaryTaskInstance( task ), ...task.instances ];
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

export const getTasksFromInstanceIndex = ( instIdx: TaskInstanceIndex ): TaskIndex => {
    validateInstanceIndex( values( instIdx ) );
    const { parents, children } = keys( instIdx )
        .reduce( ( { parents, children }, locStr ) => ({
            parents: {
                ...parents,
                ...(instIdx[ locStr ].parent > -1 && { [ locStr ]: instIdx[ instanceIndexKey( instIdx[ locStr ].filePath, instIdx[ locStr ].parent ) ] })
            },
            children: {
                ...children,
                ...(instIdx[ locStr ].parent > -1 && {
                    [ instanceIndexKey( instIdx[ locStr ].filePath, instIdx[ locStr ].parent ) ]: [
                        ...(children[ locStr ] || []), instIdx[ locStr ].uid
                    ]
                })
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
                    parents[ taskLocStr ]?.uid
                ].filter( x => x ),
                childUids: [
                    ...(uidTaskMap[ instance.uid ]?.childUids || []),
                    ...(children[ taskLocStr ] || [])
                ]
            }
        };
    }, {} as Record<string, Task> );
}

export class TaskStore {
    private events: TaskEvents;
    private state: TaskStoreState;
    private fileCacheRef: EventRef;
    private settingsUpdateRef: EventRef;
    private settings: TaskManagerSettings;
    private nextId = MIN_UID;

    constructor( taskEvents: TaskEvents, settings: TaskManagerSettings ) {
        this.events = taskEvents;
        this.settings = settings;
        this.fileCacheRef = this.events.onFileCacheUpdate( action => {
            const newInstances = reducer( this.state, action );
            this.state = this.buildStateFromInstances( newInstances );
            this.notifySubscribers();
        } );
        this.settingsUpdateRef = this.events.onSettingsUpdate( settings => {
            this.settings = settings;
        } );
    }


    public unload() {
        this.events.off( this.fileCacheRef );
        this.events.off( this.settingsUpdateRef );
    }

    public getState() {
        return { ...this.state };
    }

    private update() {
        this.notifySubscribers( { ...this.state } )
        console.log( this.state );
    }

    private notifySubscribers( data?: TaskStoreState ) {
        this.events.triggerIndexUpdated( { ...this.state } )
    }

    initialize( instances: TaskInstance[] ) {
        this.nextId = Math.max( Math.max( ...instances.map( ( { uid } ) => uid ) ) + 1, this.nextId );
        validateInstanceIndex( instances );
        console.log( 'initializing with instances', instances );
        this.state = this.buildStateFromInstances( instances.filter(
            ( inst, i, arr ) => arr.findIndex( fInst => taskInstancesEqual( inst, fInst ) ) === i )
        );
        this.update();
    }

    buildStateFromInstances( instances: TaskInstance[] ): TaskStoreState {
        const [
            existingIndex,
            newInstancesIndex
        ] = instances.filter( i => !keys( this.settings.indexFiles || {} ).includes( i.filePath ) )
            .reduce( ( [ eidx, nidx ], i ) => [
                {
                    ...eidx,
                    ...(i.uid > 0 && { [ taskLocationStr( i ) ]: i })
                }, {
                    ...nidx,
                    ...(i.uid === 0 && { [ taskLocationStr( i ) ]: i })
                }
            ], [ {}, {} ] as TaskInstanceIndex[] )
        const existingTaskIndex: TaskIndex = getTasksFromInstanceIndex( existingIndex );
        const completedUids: Set<number> = values( existingIndex ).reduce( ( uids, instance ) => {
            if ( instance.complete )
                uids.add( instance.uid );
            return uids;
        }, new Set() as Set<number> );
        const instanceIndex = instances.reduce( (
            acc,
            instance
        ) => {
            let { uid, id } = instance;
            if ( id === '' || uid === 0 ) {
                uid = findUidFromInstance( instance,
                    newInstancesIndex,
                    {
                        taskIndex: existingTaskIndex,
                        instanceIndex: existingIndex
                    } );
                if ( uid === 0 || (existingTaskIndex[ uid ].complete) ) {
                    uid = this.nextId++;
                    const pInst = createPrimaryTaskInstance( { ...instance, id, uid } );
                    acc[ instanceIndexKey( pInst.filePath, pInst.position.start.line ) ] = pInst;
                }

                id = taskUidToId( uid );
            }

            const key = instanceIndexKey( instance.filePath, instance.position.start.line );
            acc[ key ] = { ...instance, id, uid, complete: completedUids.has( uid ) || instance.complete };
            return acc;
        }, {} as TaskInstanceIndex );
        const taskIndex = getTasksFromInstanceIndex( instanceIndex );
        const indexFilesInstanceIndex = Object.entries( this.settings.indexFiles || {} )
            .reduce( ( idx, [ filename, query ] ) => {
                const filteredTasks = filterTasksByQuery( values( taskIndex ), query );
                return {}
            }, {} as TaskInstanceIndex )
        return {
            instanceIndex,
            taskIndex,
        };
    }
}

export const queryTask = ( t: Task, { value, field, op }: TaskQueryBlock ) => {
    const tVal = t[ field ];
    switch ( op ) {
        case Operator.EQ:
            return tVal === value;
        case Operator.GT:
            return tVal > value;
        case Operator.INCLUDES:
            return Array.isArray( tVal ) && tVal.findIndex( tv => tv === value ) > -1;
        case Operator.GTE:
            return tVal >= value;
        case Operator.LIKE:
            return typeof tVal === 'string' && tVal.includes( value.toString() );
        case Operator.LT:
            return tVal < value;
        case Operator.LTE:
            return tVal <= value;
        case Operator.NE:
            return tVal !== value;
    }
}

export const filterTasksByQuery = ( tasks: Task[], query?: TaskQuery ): Task[] => {
    return tasks.filter( task => {
        if ( isQueryBlock( query ) ) {
            return queryTask( task, query );
        }
    } );
}

export const validateInstanceIndex = ( instances: TaskInstance[] ) => {
    const diffIds = instances.filter( inst => inst.uid !== 0 && inst.uid !== taskIdToUid( inst.id ) );
    if ( diffIds.length )
        throw new Error( 'Task uids and ids must match.' )
};