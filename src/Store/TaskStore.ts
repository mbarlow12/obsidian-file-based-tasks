import { isEqual, keys, omit, pick, values } from 'lodash';
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
    taskInstanceFromTask,
    taskInstancesEqual,
    taskUidToId
} from "../Task/Task";
import { isQueryBlock, Operator, TaskManagerSettings, TaskQuery, TaskQueryBlock } from '../taskManagerSettings';
import { TaskIndex, TaskInstanceIndex, TaskStoreState } from './types';

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

const DEFAULT_TASKS_DIR = `tasks`;
const MIN_UID = 100000;

export const filterUnique = <T>( toFilter: T[], compareFn?: ( a: T, b: T ) => boolean ): T[] => {
    return toFilter.filter( ( elem, i, arr ) => {
        if ( compareFn )
            return arr.findIndex( fElem => compareFn( elem, fElem ) ) === i;
        return arr.indexOf( elem ) === i;
    } );
}

const createPrimaryInstance = (
    instance: Task | TaskInstance,
    tasksDir = DEFAULT_TASKS_DIR,
    created = new Date(),
    updated = new Date(),
): PrimaryTaskInstance => {
    const { uid } = instance;
    const id = uid === 0 ? '' : taskUidToId( uid );
    instance.id = id;
    const filePath = [ tasksDir, taskToFilename( instance ) ].join( '/' );
    if ( isTask( instance ) ) {
        created = instance.created;
        updated = instance.updated;
        instance = taskInstanceFromTask( filePath, 0, instance );
    }
    return {
        ...instance,
        uid,
        id,
        filePath,
        rawText: taskInstanceToChecklist( instance ),
        primary: true,
        created,
        updated
    };
};

export const createTask = (
    task: TaskInstance,
    instanceIndex: TaskInstanceIndex
): TaskInstance[] => {
    const instances: TaskInstance[] = [ createPrimaryInstance( task ) ];
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
    fileIndex = values(fileIndex).reduce((idx, i) => {
        let parent = i.parent;
        while (parent > -1) {
            const parentInst = fileIndex[instanceIndexKey(i.filePath, parent)];
            if (parentInst?.complete)
                i.complete = parentInst.complete;
            parent = parentInst?.parent || -1;
        }
        return { ...idx, [taskLocationStr(i)]: i };
    }, {})
    const fileTaskIndex = getTasksFromInstanceIndex(fileIndex);
    const paths = Array.from( values( fileIndex ).reduce( ( acc, inst ) => acc.add( inst.filePath ), new Set ) );
    if ( paths.length !== 1 )
        throw new Error( 'All instance from a file must have the same file path.' );
    return [
        ...values( existingIndex ).filter( inst => inst.filePath !== paths[ 0 ] )
            .map( existingInst => ({
                ...existingInst,
                ...pick(
                    fileTaskIndex[ existingInst.uid ] || {},
                    'complete', 'name', 'tags', 'recurrence', 'dueDate', 'links', 'completedDate' )
            }) ),
        ...values( fileIndex )
    ];
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

export const indexFileInstancesFromTask = ( filePath: string, task: Task, index: TaskIndex, start = { line: 0 } ) => {
    const parentLine = start.line++;
    const useTab = false;
    const tabSize = 4;
    const colSize = useTab ? 1 : tabSize as number;
    const parent: TaskInstance = {
        ...omit( createPrimaryInstance( task ), 'created', 'updated', 'primary' ),
        filePath,
        primary: false,
        parent: -1,
        position: emptyPosition( parentLine ),
    };
    parent.rawText = taskInstanceToChecklist( parent );
    const children: TaskInstance[] = task.childUids.sort().map( ( cuid ): Task => index[ cuid ] )
        .reduce( ( c, child ) => {
            return [
                ...c,
                ...indexFileInstancesFromTask( filePath, child, index, start )
            ]
        }, [] as TaskInstance[] )
        .map( ( inst, i ) => ({
            ...inst,
            parent: inst.parent === -1 ? parentLine : inst.parent,
            position: {
                end: inst.position.end,
                start: {
                    ...inst.position.start,
                    col: (inst.position.start.col || 0) + colSize,
                    line: i + 1
                }
            }
        }) );
    return [ parent, ...children ];
};

export const createIndexFileTaskInstances = (
    filePath: string,
    taskIndex: TaskIndex,
    filter: ( t: Task ) => boolean = ( t: Task ) => true
) => {
    const filteredIndex: TaskIndex = values( taskIndex ).reduce( ( idx, t ) => {
        return {
            ...idx,
            ...(filter( t ) && {
                [ t.uid ]: {
                    ...t,
                    childUids: t.childUids.filter( cuid => filter( taskIndex[ cuid ] ) )
                }
            })
        };
    }, {} );
    const allInstances = values( filteredIndex )
        .sort( ( a, b ) => a.created.getTime() - b.created.getTime() )
        .reduce( ( instanceArr, fTask ) => {

            if ( instanceArr.find( ti => ti.uid === fTask.uid ) )
                return [ ...instanceArr ];

            const instances = indexFileInstancesFromTask( filePath, fTask, filteredIndex );

            return [
                ...instanceArr,
                ...instances
            ]
        }, [] as TaskInstance[] )
        .map( ( inst, line ) => {
            const parent = inst.parent === -1 ? -1 : line - Math.abs( inst.position.start.line - inst.parent );
            return {
                ...inst,
                parent,
                position: {
                    start: { ...inst.position.start, line },
                    end: { ...inst.position.end }
                }
            };
        }, [] );
    return allInstances.reduce( ( idx, i ) => ({ ...idx, [ taskLocationStr( i ) ]: i }), {} as TaskInstanceIndex );
}

export const taskInstancesFromTask = ( task: Task ): TaskInstance[] => {
    const hasPrimary = task.instances.filter( inst => isPrimaryInstance( inst ) ).length === 1;
    if ( hasPrimary )
        return [ ...task.instances ]
    return [ createPrimaryInstance( task ), ...task.instances ];
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
                const primary = createPrimaryInstance( data );
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
    return keys( instIdx ).reduce( ( uidTaskMap, taskLocStr ) => {
        const instance = instIdx[ taskLocStr ];
        const task = uidTaskMap[ instance.uid ] || createTaskFromInstance( instance );
        const parentInst = instIdx[ instanceIndexKey( instance.filePath, instance.parent ) ];
        if ( parentInst ) {
            const parentTask = uidTaskMap[ parentInst.uid ] || createTaskFromInstance( parentInst );
            parentTask.childUids.push( instance.uid );
            parentTask.instances.push( parentInst );
            uidTaskMap[ parentInst.uid ] = {
                ...parentTask,
                childUids: filterUnique( [ ...(parentTask.childUids || []), instance.uid ] ),
                instances: filterUnique(
                    [ ...(parentTask.instances || []), parentInst ],
                    ( a, b ) => (
                        a.name === b.name &&
                        a.filePath === b.filePath &&
                        a.position.start.line === b.position.start.line
                    )
                )
            }
        }
        return {
            ...uidTaskMap,
            [ instance.uid ]: {
                ...task,
                parentUids: filterUnique( [ ...(task.parentUids || []), ...(parentInst && [ parentInst.uid ] || []) ] ),
                instances: filterUnique(
                    [ ...(task.instances || []), instance ],
                    ( a, b ) => (
                        a.name === b.name &&
                        a.filePath === b.filePath &&
                        a.position.start.line === b.position.start.line
                    )
                )
            }
        };
    }, {} as TaskIndex );
}

export class TaskStore {
    private events: TaskEvents;
    private state: TaskStoreState = { instanceIndex: {}, taskIndex: {} };
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

    private notifySubscribers() {
        this.events.triggerIndexUpdated( { ...this.state } )
    }

    taskInstancesAreSameTask(
        instA: TaskInstance,
        instB: TaskInstance,
        instIdx = this.state.instanceIndex,
    ) {
        if ( instA.uid === 0 || instB.uid === 0 ) {
            if (
                instA.name !== instB.name ||
                !isEqual( instA.tags?.sort(), instB.tags?.sort() ) ||
                instA.recurrence !== instB.recurrence ||
                instA.dueDate !== instB.dueDate ||
                (-1 in [ instA.parent, instB.parent ] && instA.parent !== instB.parent)
            )
                return false;

            const parentA = instIdx[ instanceIndexKey( instA.filePath, instA.parent ) ];
            const parentB = instIdx[ instanceIndexKey( instB.filePath, instB.parent ) ];
            if ( (parentA && parentB) && !this.taskInstancesAreSameTask( parentA, parentB, instIdx ) )
                return false;

            const childrenA: string[] = values( instIdx ).reduce( ( childs, inst ) => {
                if ( inst.filePath === instA.filePath && inst.parent === instA.position.start.line )
                    return [ ...childs, inst.name ]
                return childs;
            }, [] ).filter( ( c, i, arr ) => arr.findIndex( sc => c === sc ) === i );
            const childrenB: string[] = values( instIdx ).reduce( ( childs, inst ) => {
                if ( inst.filePath === instB.filePath && inst.parent === instB.position.start.line )
                    return [ ...childs, inst.name ]
                return childs;
            }, [] ).filter( ( c, i, arr ) => arr.findIndex( sc => c === sc ) === i );
            if (
                (childrenA.length !== childrenB.length) ||
                childrenA.filter( ca => !(ca in childrenB) ).length !== 0 ||
                childrenB.filter( cb => !(cb in childrenA) ).length !== 0
            )
                return false;
        }
        else {
            return instA.uid === instB.uid;
        }
        return true;
    }

    initialize( instances: TaskInstance[] ) {
        this.nextId = Math.max( Math.max( ...instances.map( ( { uid } ) => uid ) ) + 1, this.nextId );
        validateInstanceIndex( instances );
        const uniqueInstances = instances.filter( (
            inst,
            i,
            insts
        ) => insts.findIndex( ( fInst ) => taskInstancesEqual( fInst, inst ) ) === i );
        const [ withIds, noIds ] = uniqueInstances.reduce( ( [ wi, ni ]: TaskInstance[][], i ) => [
            [ ...wi, ...(i.uid > 0 ? [ i ] : []) ],
            [ ...ni, ...(i.uid === 0 ? [ i ] : []) ]
        ], [ [], [] ] );
        const idTaskInstanceIndex = withIds.reduce( ( idx, inst ) => ({
            ...idx,
            [ taskLocationStr( inst ) ]: inst
        }), {} as TaskInstanceIndex );

        for ( let i = 0; i < noIds.length; i++ ) {
            const noIdInst = noIds[ i ];
            const matching = values( idTaskInstanceIndex )
                .filter( widInst => this.taskInstancesAreSameTask( noIdInst, widInst, idTaskInstanceIndex ) );
            let uid = 0;
            if ( matching.length > 0 ) {
                const match = matching[ 0 ];
                uid = match.uid;
            }
            else {
                uid = this.nextId++;
            }
            idTaskInstanceIndex[ taskLocationStr( noIdInst ) ] = { ...noIdInst, uid, id: taskUidToId( uid ) };
        }

        this.state = this.buildStateFromInstances( values( idTaskInstanceIndex ) );
        this.notifySubscribers();
    }

    buildStateFromInstances( instances: TaskInstance[] ): TaskStoreState {
        const existingInstanceIndex = instances.filter( i => i.uid !== 0 )
            .map( i => {
                if ( isNaN( i.position.start.col ) ) {
                    const useTab = false;
                    const tabSize = useTab ? 1 : 4;
                    const char = useTab ? /^\t+/ : /^ +/;
                    const match = i.rawText.match( char );
                    const charCount = (match || [ '' ])[ 0 ].length
                    i.position.start.col = useTab ? charCount : Math.ceil( charCount / tabSize ) * tabSize;
                }
                return i;
            } )
            .reduce( ( idx, i ) => ({ ...idx, [ taskLocationStr( i ) ]: i }), {} as TaskInstanceIndex );
        const newInstancesIndex = instances.filter( i => i.uid === 0 )
            .reduce( ( idx, i ) => ({ ...idx, [ taskLocationStr( i ) ]: i }), {} as TaskInstanceIndex )
        const existingTaskIndex: TaskIndex = getTasksFromInstanceIndex( existingInstanceIndex );
        const completedUids: Set<number> = [ ...values( existingInstanceIndex ), ...instances ].reduce( (
            uids,
            instance
        ) => {
            if ( instance.complete )
                uids.add( instance.uid );
            return uids;
        }, new Set() as Set<number> );
        const instanceIndex = instances.filter( i => !this.settings.indexFiles?.has( i.filePath ) && !isPrimaryInstance( i ) )
            .reduce( (
                acc,
                instance
            ) => {
                let { uid, id } = instance;
                if ( id === '' || uid === 0 ) {
                    uid = findUidFromInstance( instance,
                        newInstancesIndex,
                        {
                            taskIndex: existingTaskIndex,
                            instanceIndex: existingInstanceIndex
                        } );
                    if ( uid === 0 || (existingTaskIndex[ uid ].complete) ) {
                        uid = this.nextId++;
                        const pInst = createPrimaryInstance( { ...instance, uid } );
                        acc[ instanceIndexKey( pInst.filePath, pInst.position.start.line ) ] = pInst;
                    }

                    id = taskUidToId( uid );
                }

                const key = instanceIndexKey( instance.filePath, instance.position.start.line );
                acc[ key ] = { ...instance, id, uid, complete: completedUids.has( uid ) || instance.complete };
                return acc;
            }, {} as TaskInstanceIndex );
        const taskIndex = getTasksFromInstanceIndex( instanceIndex );
        const primaryInstIndex: TaskInstanceIndex = values( taskIndex ).reduce( ( idx, task ) => {
            const p = createPrimaryInstance( task );
            return {
                ...idx,
                [ taskLocationStr( p ) ]: { ...p, complete: completedUids.has( p.uid ) }
            };
        }, {} );
        const indexFilesInstanceIndex = Array.from( this.settings.indexFiles.entries() )
            .reduce( ( idx, [ filename, query ] ) => {
                const filter = getTaskQueryFilter( query );
                return {
                    ...idx,
                    ...createIndexFileTaskInstances( filename, taskIndex, filter )
                }
            }, {} as TaskInstanceIndex )
        return {
            instanceIndex: {
                ...instanceIndex,
                ...primaryInstIndex,
                ...indexFilesInstanceIndex
            },
            taskIndex: getTasksFromInstanceIndex( {
                ...instanceIndex,
                ...primaryInstIndex,
                ...indexFilesInstanceIndex
            } ),
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

export const getTaskQueryFilter = ( taskQuery?: TaskQuery ): ( t: Task ) => boolean => {
    if ( !taskQuery )
        return ( _: Task ) => true;
    return ( t: Task ) => {
        if ( isQueryBlock( taskQuery ) )
            return queryTask( t, taskQuery );
    }
}

export const filterTasksByQuery = ( tasks: TaskIndex, query?: TaskQuery ): TaskIndex => {
    return values( tasks ).filter( task => {
        if ( isQueryBlock( query ) ) {
            return queryTask( task, query );
        }
    } )
        .reduce( ( idx, t ) => ({ ...idx, [ t.uid ]: t }) );
}

export const validateInstanceIndex = ( instances: TaskInstance[] ) => {
    const diffIds = instances.filter( inst => inst.uid !== 0 && inst.uid !== taskIdToUid( inst.id ) );
    if ( diffIds.length )
        throw new Error( 'Task uids and ids must match.' )
};