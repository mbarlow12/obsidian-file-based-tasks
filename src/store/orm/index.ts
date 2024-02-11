import { MTask, Task } from './models';
import { TasksORMSession } from './schema';
import { FileITaskInstanceRecord } from './types';
import { OldTask } from "task/types";
import { OldTaskInstance } from "task/types";

export const filterUnique = <T>(
    arr: T[],
    comp: ( a: T, b: T ) => boolean = ( a: T, b: T ) => a === b
) => arr.filter(
    ( elem, i ) => arr.findIndex( search => comp( elem, search ) ) === i
);

export const arraysEqual = <T>(
    a: T[],
    b: T[],
    comparator: Comparer<T> = ( a: T, b: T ) => a === b ? 1 : 0
) => {
    if ( a.length !== b.length )
        return false;
    for ( let i = 0; i < a.length; i++ ) {
        if ( comparator( a[ i ], b[ i ] ) === 0 )
            return false;
    }
    return true;
}

export const removeUndefined = <T extends Record<keyof T, unknown>>( obj: T ): T => {
    const ret: T = { ...obj };
    for ( const key in obj ) {
        if ( obj[ key ] === null || obj[ key ] === undefined || typeof obj[ key ] === 'undefined' ) {
            delete ret[key]
            continue;
        }
        ret[ key ] = obj[ key ]
    }
    return ret;
}

export const instanceComparer: Comparer<OldTaskInstance> = ( a, b ) => {
    if (
        a.id !== b.id ||
        a.name !== b.name ||
        a.line !== b.line ||
        a.filePath !== b.filePath ||
        a.parentLine !== b.parentLine ||
        a.complete !== b.complete
    )
        return 0;

    return 1;
};

export const instancesEqual = ( a: OldTaskInstance, b: OldTaskInstance ) => instanceComparer( a, b ) === 1

export const fileRecordsEqual = ( a: FileITaskInstanceRecord, b: FileITaskInstanceRecord ) => {
    if ( Object.keys( a ).length !== Object.keys( b ).length )
        return false;

    for ( const line in a ) {
        if ( !(line in b) )
            return false;
        if ( !instancesEqual( a[ line ], b[ line ] ) )
            return false;
    }
    return true;
};

export const instanceSorter = ( a: OldTaskInstance, b: OldTaskInstance ) => {
    if ( a.filePath < b.filePath )
        return -1;
    else if ( b.filePath < a.filePath )
        return 1;
    else {
        return a.line - b.line;
    }
}

export const iTaskComparer: Comparer<OldTask> = ( a, b ) => {
    if (
        a.id !== b.id || a.name !== b.name || a.complete !== b.complete || a.dueDate !== b.dueDate
        || !arraysEqual<string>( a.tags.sort(), b.tags.sort() )
        || !arraysEqual<OldTaskInstance>( a.instances.sort( instanceSorter ), b.instances.sort( instanceSorter ), instanceComparer )
        || !arraysEqual( a.childIds.sort(), b.childIds.sort() ) || !arraysEqual( a.parentIds.sort(), b.parentIds.sort() )
    )
        return 0;
    return 1;
}

export const tasksEqual = ( a: OldTask, b: OldTask ) => {
    return iTaskComparer( a, b ) === 1;
};

export const instanceIsOfTask = ( instance: OldTaskInstance, task: MTask ): boolean => {
    if (
        (instance.id > 0 && instance.id !== task.id)
        || instance.name !== task.name
        || instance.dueDate !== task.dueDate
    )
        return false;
    const iTags = instance.tags.sort();
    const tTags = task.tags.orderBy( 'name' ).toRefArray().map( t => t.name );
    if ( !arraysEqual( iTags, tTags ) )
        return false

    const iPid = instance.parentInstance?.id;
    const tPids = task.parentTasks.toRefArray().map( p => p.id );
    return !(iPid > 0 && !tPids.includes( iPid ));


}

export const bestEffortDeduplicate = ( session: TasksORMSession, fileIndex: FileITaskInstanceRecord ) => {
    for ( const instance of Object.values( fileIndex ).sort( ( a, b ) => a.line - b.line ) ) {
        if ( instance.id === 0 ) {
            if ( session.Task.exists( { name: instance.name } ) ) {
                const candidates = session.Task.filter( { name: instance.name } );
                const instSubNames = instance.childLines.map( cl => fileIndex[ cl ].name ).sort();
                for ( const candidate of candidates.toModelArray() ) {
                    const tCinsts = candidate.subTasks.toRefArray().map( s => s.name ).sort();
                    if ( instanceIsOfTask( instance, candidate ) || arraysEqual( instSubNames, tCinsts ) ) {
                        instance.id = candidate.id;
                    }
                }
            }
        }
    }
}

export type {
    UpdateFileInstanesAction,
    CreateTaskAction,
    ToggleTaskComplete,
    DeleteFileAction,
    DeleteTaskAction,
    RehydrateAction,
    RefreshRecurrencesAction,
    RenameFileAction,
    UnarchiveTasksAction,
    ArchiveTasksAction,
    TaskAction,
    UpdateTaskAction
} from './actions';
export { TaskActionType, updateFileInstances, createTask } from './actions';
export { reducerCreator } from './reducer';
export type {
    TasksORMSession,
    TaskORMSchema,
    TasksORMState
} from './schema';
export type {
    ITaskBase,
    IBaseTask,
    ITaskCreate,
    ITask,
    ITaskInstanceRecord,
    ITaskInstance,
} from './types'
export * from './selectors';
export * from './transforms';
export {
    Task,
    Tag,
    TaskInstance
} from './models';
export type {
    TaskProps,
    TaskFields,
    MinInstanceProps,
    InstanceProps,
    InstanceFields,
    TagFields
} from './models'

export * from './query';