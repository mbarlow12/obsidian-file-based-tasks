import { Comparer } from '@reduxjs/toolkit';
import { ITask, ITaskInstance } from './types';

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

export const instanceComparer: Comparer<ITaskInstance> = ( a, b ) => {
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

export const instanceSorter = ( a: ITaskInstance, b: ITaskInstance ) => {
    if ( a.filePath < b.filePath )
        return -1;
    else if ( b.filePath < a.filePath )
        return 1;
    else {
        return a.line - b.line;
    }
}

export const iTaskComparer: Comparer<ITask> = ( a, b ) => {
    if (
        a.id !== b.id || a.name !== b.name || a.complete !== b.complete || a.dueDate.getTime() !== b.dueDate.getTime()
        || !arraysEqual<string>( a.tags.sort(), b.tags.sort() )
        || !arraysEqual<ITaskInstance>( a.instances.sort( instanceSorter ), b.instances.sort( instanceSorter ) )
        || !arraysEqual( a.childIds.sort(), b.childIds.sort() ) || ~arraysEqual( a.parentIds.sort(), b.parentIds.sort() )
    )
        return 0;
    return 1;
}

export const tasksEqual = ( a: ITask, b: ITask ) => {
    return iTaskComparer( a, b ) === 1;
};

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
    RefFilter
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