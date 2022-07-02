import { EventRef, TFile } from "obsidian";
import path from 'path';
import { RRule } from "rrule";
import { TaskEvents } from "../Events/TaskEvents";
import {
    PrimaryTaskInstance,
    Task,
    TaskInstance,
    TaskLocation,
    taskLocation,
    taskLocationFromInstance,
    taskToFilename,
} from "../Task";
import { createTaskFromPrimary, isPrimaryInstance, isTask, taskInstanceFromTask, taskUidToId } from "../Task/Task";
import { DEFAULT_TASKS_DIR } from '../TaskFileManager';
import { isQueryBlock, TaskManagerSettings, TaskQuery } from '../taskManagerSettings';
import { createIndexFileTaskInstances, handleCompletions, queryTask, taskInstancesAreSameTask } from './index';
import { TaskIndex, TaskInstanceIndex, TaskStoreState } from './types';

export const hashTaskInstance = (
    { name, id, complete, parent, position: { start: { line } } }: TaskInstance
): string => [ line, id, name, complete ? 'x' : ' ', parent ].join( '||' );

export const renderTags = ( tags?: string[] ): string => (tags || []).join(' ');
export const renderRecurrence = ( rrule?: RRule ): string => rrule ? '&' + rrule.toText() : '';
export const renderDueDate = ( dueDate: Date ) => dueDate ? dueDate.toLocaleString() : '';

export const taskInstanceToChecklist = ( { complete, name, id, tags, recurrence, dueDate }: TaskInstance ): string => [
    `- [${complete ? 'x' : ' '}]`, name, renderTags( tags ), renderDueDate( dueDate ), renderRecurrence( recurrence ),
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
        if (index && index.has(loc))
            instIdx.set(loc, index.get(loc));
        else {
            let inst =  taskInstanceFromTask( loc.filePath, loc.line, task );
            if ( loc.filePath.includes( task.name ) )
                inst = createPrimaryInstance( task );
            instIdx.set(taskLocationFromInstance(inst), inst);
        }
    } );
    const prime = createPrimaryInstance( task );
    return instIdx.set(taskLocationFromInstance(prime), prime);
};

export class TaskStore {
    private events: TaskEvents;
    private state: TaskStoreState = { instanceIndex: new Map(), taskIndex: new Map() };
    private taskIndex: TaskIndex;
    private taskInstanceIndex: TaskInstanceIndex;
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
        return { ...this.state };
    }

    replaceFileInstances( newIndex: TaskInstanceIndex ): TaskInstanceIndex {
        const paths = new Set( [ ...newIndex.keys() ].map( i => i.filePath )
            .concat( ...this.settings.indexFiles.keys() ) );
        const existingIndex = new Map( this.taskInstanceIndex );
        for ( const loc of existingIndex.keys() ) {
            if ( paths.has( loc.filePath ) )
                existingIndex.delete( loc )
        }

        // propagate new instance data
        for ( const [ loc, inst ] of handleCompletions( newIndex ) ) {
            if ( inst.uid === 0 ) {
                // new task
                inst.uid = this.nextId++;
                inst.id = taskUidToId( inst.uid );
                const prime = createPrimaryInstance( inst );
                newIndex.set( taskLocationFromInstance( prime ), prime )
                newIndex.set( loc, inst );
                continue;
            }
            const task = this.taskIndex.get( inst.uid );
            const {
                complete, tags, name, recurrence, dueDate, completedDate,
            } = inst;
            for ( const taskLoc of task.locations ) {
                const taskInst = existingIndex.get( taskLoc );
                existingIndex.set( taskLoc, {
                    ...taskInst,
                    complete,
                    tags,
                    name,
                    recurrence,
                    dueDate,
                    completedDate
                } );
            }
            newIndex.set( loc, inst );
        }

        return new Map( [ ...newIndex, ...existingIndex ] );
    }

    initialize( instances: TaskInstanceIndex ) {
        const nameMap: Map<string, TaskLocation[]> = new Map();
        this.nextId = MIN_UID;
        // calculate the next id and populate the name map
        for ( const [ loc, inst ] of instances ) {
            this.nextId = Math.max( this.nextId, inst.uid );
            nameMap.set( inst.name, [ ...nameMap.get( inst.name ), loc ] )
        }

        validateInstanceIndex( instances );

        // mork tasks completed if their parent is complete
        // attempt to match new instances (uid = 0) to one another to get the uid
        // if no match, just grab the next id
        for ( const [ loc, inst ] of handleCompletions( instances ) ) {
            if ( inst.uid === 0 ) {
                const match = nameMap.get( inst.name ).filter( ( candLoc ) => {
                    const candidate = instances.get( candLoc );
                    return taskInstancesAreSameTask( inst, candidate, instances )
                } );

                if ( match.length > 0 )
                    inst.uid = instances.get( match[ 0 ] )?.uid || 0;

                if ( inst.uid === 0 ) {
                    inst.uid = this.nextId++;
                    match.map( m => instances.set( m, { ...instances.get( m ), uid: inst.uid } ) );
                }
            }
            inst.id = taskUidToId( inst.uid );
            instances.set( loc, inst );
        }

        this.buildStateFromInstances( new Map( instances ) );
    }

    buildStateFromInstances( instances: TaskInstanceIndex ): TaskStoreState {
        // instances should all have uids
        // ensure all tasks have a primary instance and add it to the instance index if no
        // add instances for index files
        // build task index
        const uidInstMap: Map<number, TaskInstance[]> = new Map();
        for ( const inst of instances.values() )
            uidInstMap.set( inst.uid, [ ...uidInstMap.get( inst.uid ), inst ] )

        const taskIndex: TaskIndex = new Map();
        for ( const [ uid, taskInsts ] of uidInstMap ) {
            let prime = taskInsts.filter( isPrimaryInstance ).pop();
            if ( !prime ) {
                prime = createPrimaryInstance( taskInsts[ 0 ] );
                instances.set( taskLocationFromInstance( prime ), prime )
            }
            let task = taskIndex.get( uid );
            if ( !task )
                task = createTaskFromPrimary( prime );
            for ( const inst of taskInsts ) {
                if ( inst.parent > -1 ) {
                    const parent = instances.get( taskLocation( inst.filePath, inst.parent ) );
                    const parentTask = taskIndex.get( parent.uid );
                    parentTask.childUids.push( inst.uid );
                    taskIndex.set( parent.uid, parentTask );
                    task.parentUids.push( parentTask.uid );
                }
            }
            taskIndex.set( uid, task );
        }
        for ( const [ fileName, query ] of this.settings.indexFiles ) {
            const fileInsts = createIndexFileTaskInstances( fileName, taskIndex, getTaskQueryFilter( query ) )
            for ( const [ loc, inst ] of fileInsts )
                instances.set( loc, inst );
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
        for (const loc of this.taskInstanceIndex.keys()) {
            if (loc.filePath === file.path) {
                uids.add(this.taskInstanceIndex.get(loc).uid)
                this.taskInstanceIndex.delete(loc);
            }
        }
        for (const uid of uids)
            this.taskIndex.delete(uid);

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