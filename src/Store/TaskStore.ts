import { EventRef, TFile } from "obsidian";
import path from 'path';
import { RRule } from "rrule";
import { TaskEvents } from "../Events/TaskEvents";
import { DEFAULT_TASKS_DIR } from '../File/TaskFileManager';
import {
    emptyPosition,
    instanceIndexKey,
    locationsEqual,
    PrimaryTaskInstance,
    Task,
    TaskInstance,
    taskLocation,
    TaskLocation,
    taskToFilename,
} from "../Task";
import {
    createTaskFromInstance,
    createTaskFromPrimary,
    isPrimaryInstance,
    isTask,
    taskInstanceFromTask,
    taskUidToId
} from "../Task/Task";
import { isQueryBlock, TaskManagerSettings, TaskQuery } from '../taskManagerSettings';
import { createIndexFileTaskInstances, handleCompletions, queryTask, taskInstancesAreSameTask } from './index';
import { TaskIndex, TaskInstanceIndex, TaskStoreState } from './types';

export const hashTaskInstance = (
    { name, id, complete, parent, position: { start: { line } } }: TaskInstance
): string => [ line, id, name, complete ? 'x' : ' ', parent ].join( '||' );

export const renderTags = ( tags?: string[] ): string => (tags ?? []).join( ' ' );
export const renderRecurrence = ( rrule?: RRule ): string => rrule ? '&' + rrule.toText() : '';
export const renderDueDate = ( dueDate: Date ) => dueDate ? dueDate.toLocaleString() : '';

export const taskInstanceToChecklist = ( { complete, name, id }: TaskInstance ): string => [
    `- [${complete ? 'x' : ' '}]`, name,
    `^${id}`
].join( ' ' );

const MIN_UID = 100000;

export const filterUnique = <T>( toFilter: T[], compareFn?: ( a: T, b: T ) => boolean ): T[] => {
    return toFilter.filter( ( elem, i, arr ) => {
        if ( compareFn )
            return arr.findIndex( fElem => compareFn( elem, fElem ) ) === i;
        return arr.indexOf( elem ) === i;
    } );
}

export const primaryTaskFilename = (
    i: TaskInstance | Task,
    taskDir = DEFAULT_TASKS_DIR
) => path.join( taskDir, taskToFilename( i ) )

const createPrimaryInstance = (
    instance: Task | TaskInstance,
    tasksDir = DEFAULT_TASKS_DIR,
    created = new Date(),
    updated = new Date(),
): PrimaryTaskInstance => {
    const { uid } = instance;
    const id = uid === 0 ? '' : taskUidToId( uid );
    instance.id = id;
    const filePath = primaryTaskFilename( instance, tasksDir );
    if ( isTask( instance ) ) {
        created = instance.created;
        updated = instance.updated;
        instance = taskInstanceFromTask( filePath, 0, instance );
    }
    return {
        ...instance,
        parent: -1,
        position: emptyPosition( 0 ),
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
    return [ ...instanceIndex.values(), ...instances ];
};

export const taskInstanceIdxFromTask = ( task: Task, index?: TaskInstanceIndex ): TaskInstanceIndex => {
    const instIdx: TaskInstanceIndex = new Map();
    task.locations.forEach( loc => {
        const key = instanceIndexKey( loc )
        if ( index && index.has( key ) )
            instIdx.set( key, index.get( key ) );
        else {
            let inst = taskInstanceFromTask( loc.filePath, loc.line, task );
            if ( loc.filePath.includes( task.name ) )
                inst = createPrimaryInstance( task );
            instIdx.set( instanceIndexKey( inst ), inst );
        }
    } );
    const prime = createPrimaryInstance( task );
    return instIdx.set( instanceIndexKey( prime ), prime );
};

export class TaskStore {
    private events: TaskEvents;
    private taskIndex: TaskIndex = new Map();
    private taskInstanceIndex: TaskInstanceIndex = new Map();
    private readonly settingsUpdateRef: EventRef;
    private settings: TaskManagerSettings;
    private nextId = MIN_UID;

    constructor( taskEvents: TaskEvents, settings: TaskManagerSettings ) {
        this.events = taskEvents;
        this.settings = settings;
        this.settingsUpdateRef = this.events.onSettingsUpdate( settings => {
            this.settings = settings;
        } );
    }

    public unload() {
        this.events.off( this.settingsUpdateRef );
    }

    public getState(): Readonly<TaskStoreState> {
        return { taskIndex: this.taskIndex, instanceIndex: this.taskInstanceIndex };
    }

    replaceFileInstances( newIndex: TaskInstanceIndex ): TaskInstanceIndex {
        // handle new uids and task completions for parents
        const newTaskIndex: TaskIndex = new Map();
        const retInstIndex: TaskInstanceIndex = new Map();
        const paths = new Set<string>( [ ...this.settings.indexFiles.keys() ] );
        for ( const [ locStr, inst ] of newIndex ) {
            let updated = false;
            paths.add( inst.filePath );
            if ( inst.uid === 0 ) {
                // new task
                inst.uid = this.nextId++;
                inst.id = taskUidToId( inst.uid );
                const prime = createPrimaryInstance( inst );
                retInstIndex.set( instanceIndexKey( prime ), prime )
                retInstIndex.set( locStr, inst );
            }

            let parentLine = inst.parent;
            while ( parentLine > -1 ) {
                const parent = newIndex.get( instanceIndexKey( inst.filePath, parentLine ) );
                if ( !parent ) {
                    parentLine = -1;
                    continue;
                }
                if ( parent.complete )
                    inst.complete = parent.complete;
                parentLine = parent.parent;
                newTaskIndex.set( parent.uid, createTaskFromInstance( parent ) );
            }
            if (this.taskIndex.has(inst.uid) && !this.taskIndex.get(inst.uid).complete) {
                inst.completedDate = new Date();
                updated = true;
            }

            retInstIndex.set( locStr, { ...inst } );
            newTaskIndex.set( inst.uid, {
                ...createTaskFromInstance( inst ),
                ...(updated && { updated: new Date() } )
            } );
        }

        // propagate new instance data
        const existingIndex = new Map( this.taskInstanceIndex );
        for ( const [ exLoc, exInst ] of existingIndex ) {
            if ( paths.has( exInst.filePath ) ) {
                existingIndex.delete( instanceIndexKey( exInst ) )
                continue
            }
            if ( newTaskIndex.has( exInst.uid ) ) {
                const { dueDate, complete, name, completedDate, recurrence } = newTaskIndex.get( exInst.uid );
                existingIndex.set( exLoc, {
                    ...exInst,
                    complete,
                    name,
                    dueDate,
                    completedDate,
                    recurrence
                } )
            }
        }

        return new Map( [ ...existingIndex, ...retInstIndex ] );
    }

    private stripUnwantedPaths( idx: TaskInstanceIndex ) {
        for ( const [ key, { filePath } ] of idx ) {
            if ( this.settings.indexFiles.has( filePath ) || this.settings.ignoredPaths.includes( filePath ) )
                idx.delete( key );
        }
        return idx;
    }

    initialize( instances: TaskInstanceIndex ) {
        const nameMap: Map<string, TaskLocation[]> = new Map();
        this.nextId = MIN_UID;
        // calculate the next id and populate the name map
        for ( const inst of instances.values() ) {
            this.nextId = Math.max( this.nextId, inst.uid );
            nameMap.set( inst.name, [
                ...(nameMap.get( inst.name ) ?? []), taskLocation( inst.filePath, inst.position.start.line )
            ] );
        }

        validateInstanceIndex( instances );

        // mork tasks completed if their parent is complete
        // attempt to match new instances (uid = 0) to one another to get the uid
        // if no match, just grab the next id
        for ( const [ loc, inst ] of handleCompletions( instances ) ) {
            if ( inst.uid === 0 ) {
                const match = nameMap.get( inst.name ).filter( ( candLoc ) => {
                    const candidate = instances.get( instanceIndexKey( candLoc ) );
                    return taskInstancesAreSameTask( inst, candidate, instances )
                } );

                if ( match.length > 0 )
                    inst.uid = instances.get( instanceIndexKey( match[ 0 ] ) )?.uid ?? 0;

                if ( inst.uid === 0 ) {
                    inst.uid = this.nextId++;
                    match.map( m => instances.set(
                        instanceIndexKey( m ),
                        {
                            ...instances.get( instanceIndexKey( m ) ),
                            uid: inst.uid
                        } ) );
                }
            }
            inst.id = taskUidToId( inst.uid );
            instances.set( loc, inst );
        }

        return new Map( instances );
    }

    buildStateFromInstances( instances: TaskInstanceIndex ): TaskStoreState {
        instances = this.stripUnwantedPaths( instances );
        // instances should all have uids
        // ensure all tasks have a primary instance and add it to the instance index if no
        // add instances for index files
        // build task index
        const uidInstMap: Map<number, TaskInstance[]> = new Map();
        for ( const inst of instances.values() )
            uidInstMap.set( inst.uid, [ ...(uidInstMap.get( inst.uid ) ?? []), inst ] )

        const taskIndex: TaskIndex = new Map();
        for ( const [ uid, taskInsts ] of uidInstMap ) {
            let prime = taskInsts.filter( isPrimaryInstance ).pop();
            if ( !prime ) {
                const existingTask = this.taskIndex.get( uid );
                prime = createPrimaryInstance( existingTask ?? taskInsts[ 0 ] );
                instances.set( instanceIndexKey( prime ), prime )
            }
            let task = taskIndex.get( uid );
            if ( !task )
                task = createTaskFromPrimary( prime );
            else
                task = { ...task, created: prime.created, updated: prime.updated }
            for ( const inst of taskInsts ) {
                if ( inst.parent > -1 ) {
                    const parent = instances.get( instanceIndexKey( inst.filePath, inst.parent ) );
                    let parentTask = taskIndex.get( parent.uid );
                    if ( !parentTask )
                        parentTask = createTaskFromInstance( parent );
                    taskIndex.set( parent.uid, {
                        ...parentTask,
                        childUids: filterUnique( [ ...parentTask.childUids, inst.uid ] )
                    } );
                    task.parentUids.push( parentTask.uid );
                }
                task.locations.push( taskLocation( inst ) )
            }
            taskIndex.set( uid, {
                ...task,
                parentUids: filterUnique( task.parentUids ),
                locations: filterUnique( task.locations, locationsEqual )
            } );
        }

        for ( const [ fileName, query ] of this.settings.indexFiles ) {
            const fileInsts = createIndexFileTaskInstances( fileName, taskIndex, getTaskQueryFilter( query ) )
            for ( const [ loc, inst ] of fileInsts ) {
                instances.set( loc, inst );
                const task = taskIndex.get( inst.uid );
                taskIndex.set( task.uid, {
                    ...task,
                    locations: [ ...task.locations, taskLocation( inst ) ],
                } )
            }
        }
        this.taskIndex = taskIndex;
        this.taskInstanceIndex = instances;
        return {
            taskIndex,
            instanceIndex: instances
        };
    }

    deleteTasksFromFile( file: TFile ) {
        const uids = new Set<number>();
        const deletedIdx = new Map( this.taskInstanceIndex );
        for ( const inst of deletedIdx.values() ) {
            if ( inst.filePath === file.path ) {
                const key = instanceIndexKey( inst );
                uids.add( deletedIdx.get( key ).uid )
                deletedIdx.delete( key );
            }
        }
        return deletedIdx;
    }

    deleteTask( task: Task ): TaskInstanceIndex {
        const newInstIdx = new Map();
        for ( const [ key, inst ] of this.taskInstanceIndex ) {
            if ( inst.uid !== task.uid )
                newInstIdx.set( key, inst );
        }
        return newInstIdx;
    }

    renameFilePath( oldPath: string, newPath: string ): TaskInstanceIndex {

        const newIndex = new Map( this.taskInstanceIndex );
        for ( const [ key, instance ] of newIndex ) {
            if ( instance.filePath === oldPath ) {
                newIndex.delete( key );
                const newInst = { ...instance, filePath: newPath };
                newIndex.set( instanceIndexKey( newInst ), newInst )
            }
        }
        return newIndex;
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
        if ( isQueryBlock( query ) )
            if ( queryTask( task, query ) )
                filtered.set( uid, task );
    }
    return filtered;
}

export const validateInstanceIndex = ( instances: TaskInstanceIndex ) => {
    const diffIds = [];
    for ( const inst of instances.values() ) {
        if ( inst.uid !== 0 && inst.id !== '' && taskUidToId( inst.uid ) !== inst.id )
            diffIds.push( inst );
    }
    if ( diffIds.length )
        throw new Error( 'Task uids and ids must match.' )
};