import { isEqual, omit, pick, values } from 'lodash';
import { EventRef } from "obsidian";
import { RRule } from "rrule";
import { TaskEvents } from "../Events/TaskEvents";
import { ActionType, IndexUpdateAction } from "../Events/types";
import {
    emptyPosition,
    PrimaryTaskInstance,
    Task,
    TaskInstance,
    TaskLocation,
    taskLocation,
    taskLocationFromInstance,
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
import { Comparator } from '../util/SortedArray';
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
const LOCATION_COMPARATOR: Comparator<TaskLocation> = ( a, b ) => {
    if ( a.filePath === b.filePath ) {
        return a.line - b.line;
    }
    else if ( a.filePath > b.filePath )
        return 1;
    else
        return -1;
}
const INSTANCE_COMPARATOR: Comparator<TaskInstance> = (
    a,
    b
) => LOCATION_COMPARATOR(
    taskLocationFromInstance( a ),
    taskLocationFromInstance( b )
);

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
    return [...instanceIndex.values(), ...instances];
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
    instances: TaskInstance[],
    { taskIndex, instanceIndex: existingIndex }: TaskStoreState,
): TaskInstance[] => {
    const fileIndex = instances.reduce( ( idx, i ) => {
        let parent = i.parent;
        while ( parent > -1 ) {
            const parentInst = findInstanceParent( i, instances );
            if ( parentInst?.complete )
                i.complete = parentInst.complete;
            parent = parentInst?.parent || -1;
        }
        return idx.set( taskLocationFromInstance( i ), i );
    }, new Map() as TaskInstanceIndex );
    const fileTaskIndex = taskIndexFromInstances( instances );
    const paths = Array.from( instances.reduce( ( acc, inst ) => acc.add( inst.filePath ), new Set ) );
    if ( paths.length !== 1 )
        throw new Error( 'All instance from a file must have the same file path.' );
    return [
        ...Array.from( existingIndex.values() ).filter( inst => inst.filePath !== paths[ 0 ] )
            .map( existingInst => ({
                ...existingInst,
                ...pick(
                    fileTaskIndex.get( existingInst.uid ) || {},
                    'complete', 'name', 'tags', 'recurrence', 'dueDate', 'links', 'completedDate' )
            }) ),
        ...Array.from( fileIndex.values() )
    ];
};

export const arraysEqual = <T>( a: T[], b: T[] ): boolean => {
    return a.length === b.length &&
        a.every( ( elem, idx ) => elem === b[ idx ] );
}

export const findInstanceUid = (
    instance: TaskInstance,
    instances: TaskInstance[],
    taskIndex: TaskIndex,
) => {
    if ( instance.uid !== 0 )
        return instance.uid;
    const nameUids: Map<string, number[]> = instances.reduce( ( nUids, inst ) => {
        if ( !nUids.has( inst.name ) )
            nUids.set( inst.name, [ inst.uid ] )
        return nUids.set( inst.name, [ ...(nUids.get( inst.name ) || []), inst.uid ] );
    }, new Map );

    if ( nameUids.has( instance.name ) ) {
        const instParent = findInstanceParent( instance, instances );
        const instChildUids: number[] = instances.filter( child => {
            return child.filePath === instance.filePath && child.parent === instance.position.start.line
        } )
            .map( i => i.uid );
        return nameUids.get( instance.name ).find( uid => {
            const task = taskIndex.get( uid );
            const parentsMatch = (
                instParent &&
                task.parentUids.length &&
                task.parentUids.includes( instParent.uid )
            ) || (
                !instParent && !task.parentUids.length
            );
            const childrenMatch = arraysEqual( task.childUids.sort(), instChildUids.sort() );
            return parentsMatch && childrenMatch;
        } )
    }
    return 0;
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

    const existingInsts = Array.from( instanceIndex.values() );
    const taskIndex = getTasksFromInstanceIndex( instanceIndex );
    const nameUids: Map<string, number[]> = existingInsts.reduce( ( nUids, inst ) => {
        if ( !nUids.has( inst.name ) )
            nUids.set( inst.name, [ inst.uid ] )
        return nUids.set( inst.name, [ ...(nUids.get( inst.name ) || []), inst.uid ] );
    }, new Map );

    if ( nameUids.has( instance.name ) ) {
        const instParent = fileIndex.get( taskLocation( instance.filePath, instance.parent ) );
        const instChildUids = Array.from( fileIndex.values() )
            .filter( child => child.filePath === instance.filePath && child.parent === instance.position.start.line )
            .map( inst => inst.uid );
        return nameUids.get( instance.name ).find( uid => {
            const existingTask = taskIndex.get( uid );
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
    const children: TaskInstance[] = task.childUids.sort().map( ( cuid ): Task => index.get( cuid ) )
        .reduce( ( c, child: Task ) => {
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
    const filteredIndex: TaskIndex = Array.from( taskIndex.values() ).reduce( ( idx, t ) => {
        if ( filter( t ) )
            idx.set( t.uid, {
                ...t,
                childUids: t.childUids.filter( cuid => filter( taskIndex.get( cuid ) ) )
            } )
        return idx;
    }, new Map() as TaskIndex );
    const allInstances = Array.from( taskIndex.values() )
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
    return allInstances.reduce( (
        idx: TaskInstanceIndex,
        i: TaskInstance
    ) => idx.set( taskLocationFromInstance( i ), i ), new Map() );
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
            return deleteTaskUid( data.uid, Array.from( instanceIndex.values() ) )

        case ActionType.DELETE_TASKS:
            return deleteTaskUids( data, Array.from( instanceIndex.values() ) );

        case ActionType.MODIFY_TASK:
            if ( data.uid > 0 && uids.contains( data.uid ) ) {
                return modifyTask( data, Array.from( instanceIndex.values() ) )
            }
            else {
                const primary = createPrimaryInstance( data );
                return [
                    ...instanceIndex.values(),
                    ...(data.instances || []),
                    primary,
                ]
            }

        case ActionType.RENAME_FILE:
            return renameTaskInstanceFile( data.oldPath, data.newPath, Array.from( instanceIndex.values() ) )

        case ActionType.DELETE_FILE:
            return deleteTaskInstanceFile( data, Array.from( instanceIndex.values() ) );

        case ActionType.MODIFY_FILE_TASKS:
            return addFileTaskInstances( data, state );
    }

    return Array.from( instanceIndex.values() );
};

export const findInstanceParent = (
    instance: TaskInstance,
    instances: TaskInstance[]
) => findInstanceByLocation( instance.filePath, instance.parent, instances );

export const findInstanceByLocation = (
    filePath: string,
    line: number,
    instances: TaskInstance[]
) => {
    for ( let i = 0; i < instances.length; i++ ) {
        if ( instances[ i ].filePath === filePath && instances[ i ].position.start.line === line )
            return instances[ i ];
    }
}

export const taskIndexFromInstances = ( instances: TaskInstance[] ): TaskIndex => {
    validateInstanceIndex( instances );
    return instances.reduce( ( idx, instance ) => {
        const task = idx.get( instance.uid ) || createTaskFromInstance( instance );
        const parentInst = findInstanceParent( instance, instances );
        if ( parentInst ) {
            const parentTask = idx.get( parentInst.uid ) || createTaskFromInstance( parentInst );
            parentTask.childUids.push( instance.uid );
            parentTask.instances.push( parentInst );
            idx.set( parentInst.uid, {
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
            } );
        }
        idx.set( instance.uid, {
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
        } )
        return idx;
    }, new Map() as TaskIndex )
}

export const getTasksFromInstanceIndex = ( instIdx: TaskInstanceIndex ): TaskIndex => taskIndexFromInstances( Array.from( instIdx.values() ) );

export class TaskStore {
    private events: TaskEvents;
    private state: TaskStoreState = { instanceIndex: new Map(), taskIndex: new Map() };
    private taskIndex: TaskIndex;
    private taskInstances: TaskInstance[];
    private readonly fileCacheRef: EventRef;
    private readonly settingsUpdateRef: EventRef;
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

            const parentA = instIdx.get( taskLocation( instA.filePath, instA.parent ) );
            const parentB = instIdx.get( taskLocation( instB.filePath, instB.parent ) );
            if ( (parentA && parentB) && !this.taskInstancesAreSameTask( parentA, parentB, instIdx ) )
                return false;

            const childrenA = new Set()
            const childrenB = new Set()
            for ( const inst of instIdx.values() ) {
                if ( inst.filePath === instA.filePath && inst.parent === instA.position.start.line )
                    childrenA.add( inst.name )
                if ( inst.filePath === instB.filePath && inst.parent === instB.position.start.line )
                    childrenB.add( inst.name )
            }
            if (
                (childrenA.size !== childrenB.size) ||
                [ ...childrenA ].filter( ca => !childrenB.has( ca ) ).length !== 0 ||
                [ ...childrenB ].filter( cb => !childrenA.has( cb ) ).length !== 0
            )
                return false;
        }
        else {
            return instA.uid === instB.uid;
        }
        return true;
    }

    private findInsertIndex(
        location: TaskLocation,
        instances = this.taskInstances,
        comparator: Comparator<TaskLocation> = LOCATION_COMPARATOR
    ) {
        let lo = 0,
            hi = instances.length - 1,
            mid: number,
            found: number;

        while ( lo <= hi ) {
            mid = (lo + hi) >>> 1;
            found = comparator( taskLocationFromInstance( instances[ mid ] ), location );
            if ( found === 0 )
                return mid;
            else if ( found > 0 )
                hi = mid - 1;
            else
                lo = mid + 1;
        }
        return ~lo;
    }

    private getIndexRangeForPath( path: string, instances?: TaskInstance[], comparator?: Comparator<TaskLocation> ) {
        const low = this.findInsertIndex( taskLocation( path, -Infinity ), instances, comparator );
        const high = this.findInsertIndex( taskLocation( path, Infinity ), instances, comparator );
        return [ ~low, ~high ];
    }

    private findIndexForInstance(
        inst: TaskInstance,
        comp?: Comparator<TaskLocation>,
        instances?: TaskInstance[]
    ) {
        return this.findInsertIndex( taskLocationFromInstance( inst ), instances, comp );
    }

    private findInstanceByLocation( path: string, line: number, instances = this.taskInstances ) {
        const i = this.findInsertIndex( taskLocation( path, line ), instances );
        if ( i > -1 )
            return instances[ i ];
        return null;
    }

    filterInstancesByPath( path: string, instances?: TaskInstance[], comp?: Comparator<TaskLocation> ) {
        const [ low, high ] = this.getIndexRangeForPath( path, instances, comp );
        return instances.slice( low, high );
    }

    private spliceInstances(
        newInstances: TaskInstance[],
        existingInstances: TaskInstance[],
        comparator: Comparator<TaskLocation> = LOCATION_COMPARATOR,
    ): TaskInstance[] {
        const mergePaths = new Set( newInstances.map( i => i.filePath ) );
        let prevHigh = 0;
        const parts: TaskInstance[][] = [];
        for ( const path of mergePaths ) {
            const toInsert = this.filterInstancesByPath( path, newInstances );
            const [ low, high ] = this.getIndexRangeForPath( path, existingInstances, comparator );
            existingInstances.splice( low, Math.abs( high - low ), ...toInsert );
            parts.push( existingInstances.slice( prevHigh, low ).concat( toInsert ) );
            prevHigh = high;
        }
        return parts.flat()
    }

    private handleCompleteInstances( instances: TaskInstance[] ) {
        for ( let i = 0; i < instances.length; i++ ) {
            const current = instances[ i ];
            let parentLine = current.parent;
            while ( parentLine > -1 ) {
                const parent = this.findInstanceByLocation( current.filePath, parentLine, instances );
                if ( parent && parent.complete )
                    current.complete = parent.complete;
                parentLine = parent?.parent || -1;
            }
        }
        return instances;
    }

    private pathInInstances( path: string, instances?: TaskInstance[] ) {
        const comp: Comparator<TaskLocation> = ( a, b ) => {
            if ( a.filePath < b.filePath )
                return -1;
            else if ( a.filePath > b.filePath )
                return 1;
            else
                return 0;
        };
        return this.findInsertIndex( taskLocation( path, 0 ), instances, comp ) >= 0;
    }

    private getPathsFromInstances( instances: TaskInstance[] ) {
        const paths = new Set();
        for ( let i = 0; i < instances.length; i++ )
            paths.add( instances[ i ].filePath )
        return Array.from( paths );
    }

    private replaceFileInstances( newInstances: TaskInstance[] ) {
        const paths = new Set( newInstances.map( i => i.filePath ).concat( ...this.settings.indexFiles.keys() ) );
        const slices: TaskInstance[][] = [];
        let oldHigh = 0;
        for ( const path of paths ) {
            const [ lo, hi ] = this.getIndexRangeForPath( path, this.taskInstances );
            slices.push( this.taskInstances.slice( oldHigh, lo ) );
            oldHigh = hi;
        }
        const existingInstances = slices.flat();

        // propagate new instance data
        newInstances = this.handleCompleteInstances( newInstances.sort( INSTANCE_COMPARATOR ) )
            .flatMap( newInst => {
                if ( newInst.uid === 0 ) {
                    // new task
                    newInst.uid = this.nextId++;
                    newInst.id = taskUidToId( newInst.uid );
                    return [ newInst, createPrimaryInstance( newInst ) ];
                }
                const task = this.taskIndex.get( newInst.uid );
                const {
                    complete, tags, name, recurrence, dueDate, completedDate,
                } = newInst;
                for ( const inst of task.instances ) {
                    const index = this.findInsertIndex( taskLocationFromInstance( inst ), existingInstances )
                    existingInstances[ index ] = {
                        ...existingInstances[ index ],
                        complete, tags, name, recurrence, dueDate, completedDate
                    };
                }
                return newInst;
            } );

        const instanceIndex: TaskInstanceIndex = new Map();
        const taskIndex: TaskIndex = new Map();
        const allInstances = this.spliceInstances( newInstances.sort( INSTANCE_COMPARATOR ), existingInstances );
        for ( let i = 0; i < allInstances.length; i++ ) {
            const currentInst = this.taskInstances[ i ];
            instanceIndex.set( taskLocationFromInstance( currentInst ), { ...currentInst } );

            if ( !taskIndex.has( currentInst.uid ) )
                taskIndex.set( currentInst.uid, { ...createTaskFromInstance( currentInst ), instances: [] } );

            const task = taskIndex.get( currentInst.uid );
            task.instances.push( currentInst );

            if ( isPrimaryInstance( currentInst ) ) {
                task.created = currentInst.created;
                task.updated = currentInst.updated;
            }

            taskIndex.set( currentInst.uid, task );
        }
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
        return { taskIndex: new Map(), instanceIndex: new Map()};
    }

    private findParent( instance: TaskInstance, instanceList: TaskInstance[] = this.taskInstances ): TaskInstance {
        return this.findInstanceByLocation( instance.filePath, instance.parent, instanceList );
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
    const filtered: TaskIndex = new Map();
    for ( const [ uid, task ] of tasks.entries() ) {
        if (isQueryBlock( query ))
            if ( queryTask(task, query))
                filtered.set(uid, task);
    }
    return filtered;
}

export const validateInstanceIndex = ( instances: TaskInstance[] ) => {
    const diffIds = instances.filter( inst => inst.uid !== 0 && inst.uid !== taskIdToUid( inst.id ) );
    if ( diffIds.length )
        throw new Error( 'Task uids and ids must match.' )
};