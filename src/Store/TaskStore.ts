import { entries, keys, omit } from 'lodash';
import { EventRef } from "obsidian";
import { RRule } from "rrule";
import { TaskEvents } from "../Events/TaskEvents";
import { ActionType, IndexUpdateAction } from "../Events/types";
import { Task, TaskInstance, TaskLocation, TaskUID } from "../Task";
import { emptyTask, taskIdToUid, taskUidToId } from "../Task/Task";
import { IndexTask, InstanceIndex, TaskIndex, TaskStoreState } from './types';

export const taskLocationFromLineTask = ( lt: TaskInstance, path: string ): TaskLocation => ({
    filePath: path,
    position: lt.position,
    parent: lt.parent
});

export const getIndexedTask = (
    lineTask: TaskInstance,
    r: Record<TaskUID, Task>,
    nextId: number
): Task => {
    const uid = taskIdToUid( lineTask.id )
    return uid > 0 && uid in r && r[ uid ] ||
           Object.values( r ).find( rt => rt.name === lineTask.name ) ||
        { ...emptyTask(), uid: uid || nextId };
}

export const hashLineTask = (
    { name, id, complete, parent, position: { start: { line } } }: TaskInstance
): string => [ line, id, name, complete ? 'x' : ' ', parent ].join( '||' );

export const renderTags = ( tags?: string[] ): string => ``;
export const renderRecurrence = ( rrule?: RRule ): string => ``;
export const renderDueDate = ( dueDate: Date ) => dueDate.toLocaleString();

export const lineTaskToChecklist = ( { complete, name, id, tags, recurrence, dueDate }: TaskInstance ): string => [
    `- [${complete}]`, name, renderTags( tags ), renderDueDate( dueDate ), renderRecurrence( recurrence ), `^${id}`
].join( ' ' );

export const indexedTaskToInstanceIndex = (
    { instances }: Task
): InstanceIndex => instances.reduce( ( instIdx, instance ) => {
    return {
        ...instIdx,
        [ instance.filePath ]: [ ...instIdx[ instance.filePath ], instance ]
    }
}, {} as InstanceIndex )

export const indexTaskFromTask = ( task: Task, nextId: number ): IndexTask => ({
    ...omit( task, 'instances' ),
    uid: nextId,
    id: taskUidToId( nextId ),
});

export const indexTaskFromInstance = ( instance: TaskInstance, nextId: number ): IndexTask => ({
    ...omit( instance, 'filePath', 'position', 'parent', 'rawText', 'task' ),
    uid: nextId,
    id: taskUidToId( nextId ),
    description: '',
    created: new Date(),
    updated: new Date(),
    parentUids: [],
    childUids: [],
});

export const createTask = (
    task: Task,
    nextId: number,
    { index, instanceIndex }: TaskStoreState ): TaskStoreState => ({
    index: {
        ...index,
        [ nextId ]: indexTaskFromTask( task, nextId )
    },
    instanceIndex: {
        ...instanceIndex,
        ...indexedTaskToInstanceIndex( task )
    }
});

const reducer = ( { index, instanceIndex }: TaskStoreState, { data, type }: IndexUpdateAction ): TaskStoreState => {
    const [ uids, names ] = Object.values( index )
        .reduce( ( [ iUids, iNames ], iTask ) => {
            return [ [ ...iUids, iTask.uid ], [ ...iNames, iTask.name ] ]
        }, [ [], [] ] as [ number[], string[] ] );
    const nextId = Math.max( ...uids ) + 1;

    switch ( type ) {
        case ActionType.CREATE_TASK:
            if ( data.id === '' && !names.contains( data.name ) ) {
                return createTask( data, nextId, { index, instanceIndex } )
            }
            break;
        case ActionType.DELETE_TASK:
            if ( data.uid > 0 && uids.contains( data.uid ) )
                delete index[ data.uid ];
            return { index, instanceIndex };
        case ActionType.MODIFY_TASK:
            if ( data.uid > 0 && uids.contains( data.uid ) ) {
                index[ data.uid ] = { ...data };
            }
            else {
                index[ nextId ] = indexTaskFromTask( data, nextId );
            }
            if ( data.instances.length )
                instanceIndex = { ...instanceIndex, ...indexedTaskToInstanceIndex( data ) }
            return { index, instanceIndex };
        case ActionType.RENAME_FILE:
            return {
                index,
                instanceIndex: keys( instanceIndex ).reduce( ( idx, currentPath ) => {
                    const { oldPath, newPath } = data;
                    return {
                        ...idx,
                        [ currentPath === oldPath ? newPath : currentPath ]: instanceIndex[ currentPath ]
                    }
                }, {} as InstanceIndex )
            }
        case ActionType.DELETE_FILE:
            return {
                index,
                instanceIndex: keys( instanceIndex ).filter( k => k !== data )
                    .reduce( ( idx, path ) => ({ ...idx, [ path ]: idx[ path ] }), {} as InstanceIndex )
            }
        case ActionType.MODIFY_FILE_TASKS:
            return {
                index,
                instanceIndex: {
                    ...instanceIndex,
                    ...data.instanceIndex,
                }
            }
    }

    return { index, instanceIndex }
};


export class TaskStore {
    private events: TaskEvents;
    private state: TaskStoreState;
    private static MIN_UID = 100000;
    private fileCacheRef: EventRef;

    constructor( taskEvents: TaskEvents ) {
        this.events = taskEvents;
        this.fileCacheRef = this.events.onFileCacheUpdate( action => {
            this.state = reducer( { ...this.state }, action );
            this.update();
        } );
    }


    public unload() {
        this.events.off( this.fileCacheRef );
    }

    public getState() {
        return { ...this.state };
    }

    // ensures all tasks have the correct uids and tids
    // if ANY task with uid 0 has the same name as another, we update it to the other's uid
    // todo: in the future, 0 ids can indicate an explicitly new task
    public unifyState( taskIndex: TaskIndex, instanceIndex: InstanceIndex ): TaskStoreState {
        const indexNameUidMap: Record<string, number> = entries( taskIndex )
            .reduce( ( nuMap, [ uid, task ] ) => ({ ...nuMap, [ task.name ]: Number.parseInt( uid ) }), {} );
        const instanceNameUidMap: Record<string, number> = entries( instanceIndex )
            .reduce( ( nuMap, [ path, instances ] ) => {
                return {
                    ...nuMap,
                    ...instances.reduce( ( fileNameUidMap, inst ) => ({
                        ...fileNameUidMap,
                        [ inst.name ]: taskIdToUid( inst.id ) || nuMap[ inst.name ]
                    }), {} as Record<string, number> )
                }
            }, {} as Record<string, number> )

        // assign existing
        // remove instances with uids > 0 and not in the task index
        const newInstanceIdx: InstanceIndex = entries( instanceIndex )
            .map( ( [ path, instances ] ) => {
                return {
                    path,
                    instances: instances.map<TaskInstance>( inst => ({
                        ...inst,
                        uid: indexNameUidMap[ inst.name ] || 0,
                        id: taskUidToId( indexNameUidMap[ inst.name ] || 0 )
                    }) )
                }
            } )
            .reduce( ( newidx, { path, instances } ) => {
                return {
                    ...newidx,
                    [ path ]: instances.filter( i => taskIdToUid( i.id ) > 0 && !(taskIdToUid( i.id ) in taskIndex) )
                }
            }, {} as InstanceIndex );

        // add instances with uid === 0
        const newTaskIndex = instanceIndex

        let nextUid = Math.max( ...keys( taskIndex ).map( Number.parseInt ) ) + 1
        const { index, instanceIdx } = entries( instanceIndex )
            .reduce( ( { index, instanceIdx }, [ path, tInstances ] ) => {

                const fileIndex: InstanceIndex = {
                    [ path ]: tInstances.filter( inst => inst.uid !== 0 && !(inst.uid in taskIndex) )
                        .map( inst => ({
                            ...inst,
                            uid: instanceNameUidMap[ inst.name ],
                            id: taskUidToId( instanceNameUidMap[ inst.name ] )
                        }) )
                };

                const indexTasks: IndexTask[] = tInstances.filter( i => i.uid === 0 && !(i.name in instanceNameUidMap) )
                    .map( inst => indexTaskFromInstance( inst, nextUid++ ) )
                    .sort( ( a, b ) => a.uid - b.uid );

                return { index: [ ...index, ...indexTasks ], instanceIdx: { ...instanceIdx, ...fileIndex } };
            }, { index: [], instanceIdx: {} } as { index: IndexTask[], instanceIdx: InstanceIndex } );

        return {
            index: taskIndex,
            instanceIndex: keys( instanceIndex ).reduce( ( newInstIdx, path ) => {
                return {
                    ...newInstIdx,
                    [ path ]: instanceIndex[ path ].map( inst => ({
                        ...inst,
                        uid: instanceNameUidMap[ inst.name ],
                        id: taskUidToId( instanceNameUidMap[ inst.name ] )
                    }) )
                }
            }, {} as InstanceIndex )
        };
    }

    // public taskRecordFromState( state: InstanceIndex ): Record<TaskUID, Task> {
    //     const uids = new Set( Object.values( state ).filter( t => t.id ).map( t => taskIdToUid( t.id ) ) );
    //     let nextId = Math.max( Math.max( ...uids ) + 1, TaskStore.MIN_UID );
    //     const rec: Record<TaskUID, Task> = Object.keys( state ).reduce( ( r, locStr ) => {
    //         const lineTask = this.state[ locStr ];
    //         const idxTask = getIndexedTask( lineTask, r, nextId );
    //         if ( idxTask.uid < TaskStore.MIN_UID ) {
    //             idxTask.uid += TaskStore.MIN_UID;
    //         }
    //         idxTask.id = taskUidToId( idxTask.uid )
    //         if ( idxTask.uid === nextId ) nextId++;
    //         state[ locStr ].uid = idxTask.uid;
    //         state[ locStr ].id = idxTask.id;
    //         return {
    //             ...r,
    //             [ lineTask.uid ]: {
    //                 ...idxTask,
    //                 complete: idxTask.complete || lineTask.complete,
    //             }
    //         }
    //     }, {} as Record<TaskUID, Task> );
    //
    //     for ( const locStr in state ) {
    //         const { filePath } = taskLocFromMinStr( locStr );
    //         const lineTask = state[ locStr ];
    //         const task = rec[ lineTask.uid ];
    //         const parentLine = lineTask.parent;
    //         const parent = state[ minTaskLocStr( { filePath, lineNumber: parentLine } ) ]
    //         if ( parent ) {
    //             rec[ parent.uid ] = {
    //                 ...rec[ parent.uid ],
    //                 childUids: [ ...rec[ parent.uid ].childUids, lineTask.uid ]
    //             }
    //         }
    //         rec[ lineTask.uid ] = {
    //             ...task,
    //             locations: [ ...task.locations, taskLocationFromLineTask( lineTask, filePath ) ],
    //             parentUids: [ ...task.parentUids, ...[ parent?.uid ] ].filter( x => x ),
    //             parentLocations: [ ...task.parentLocations,
    //                                ...[ parent && taskLocationFromLineTask( parent, filePath ) ] ].filter( x => x )
    //         }
    //     }
    //     return rec;
    // }

    private update() {
        // const index = this.taskRecordFromState( this.state );
        this.notifySubscribers( { ...this.state } )
    }

    private notifySubscribers( data: TaskStoreState ) {
        this.events.triggerIndexUpdated( data )
    }

    initialize( index: TaskIndex, instances: InstanceIndex ) {
        this.state = this.unifyState( { ...index }, { ...instances } );
    }
}