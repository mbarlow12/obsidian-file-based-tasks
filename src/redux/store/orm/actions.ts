import { Dictionary } from '@reduxjs/toolkit';
import { CreateProps } from 'redux-orm';
import { Task } from './models';
import { ITask, ITaskCreate, ITaskInstance, ITaskInstanceRecord } from './types';

export enum TaskActionType {
    CREATE_TASK = 'CREATE_TASK',
    DELETE_TASK = 'DELETE_TASK',
    UPDATE_TASK = 'UPDATE_TASK',
    UPDATE_FILE_INSTANCES = 'UPDATE_FILE_INSTANCES',
    DELETE_FILE = 'DELETE_FILE',
    RENAME_FILE = 'RENAME_FILE',
    COMPLETE_TASK = 'COMPLETE_TASK',
    UNCOMPLETE_TASK = 'UNCOMPLETE_TASK',
    ARCHIVE_TASKS = 'ARCHIVE_TASKS',
    UNARCHIVE_TASKS = 'UNARCHIVE_TASKS',
    REFRESH_RECURRENCES = 'REFRESH_RECURRENCES',
    REHYDRATE = 'REHYDRATE'
}

export const isTaskAction = (action: any): action is TaskAction => {
    if (!('type' in action))
        return false;
    return Object.values(TaskActionType).includes(action.type as TaskActionType);
}

export interface UpdateFileInstanesAction {
    type: TaskActionType.UPDATE_FILE_INSTANCES;
    payload: {
        path: string,
        instances: Record<string, ITaskInstance>
    }
}

export interface CreateTaskAction {
    type: TaskActionType.CREATE_TASK;
    payload: ITaskCreate
}

export interface DeleteTaskAction {
    type: TaskActionType.DELETE_TASK,
    payload: ITask | number
}

export interface UpdateTaskAction {
    type: TaskActionType.UPDATE_TASK,
    payload: Partial<ITask>
}

export interface DeleteFileAction {
    type: TaskActionType.DELETE_FILE,
    payload: {
        path: string,
        data?: ITask | ITaskInstance[]
    }
}

export interface RenameFileAction {
    type: TaskActionType.RENAME_FILE,
    payload: {
        oldPath: string,
        newPath: string
    }
}

export interface CompleteTaskAction {
    type: TaskActionType.COMPLETE_TASK,
    payload: number | ITask | ITaskInstance
}

export interface UncompleteTaskAction {
    type: TaskActionType.UNCOMPLETE_TASK,
    payload: number | ITask | ITaskInstance
}

export interface ArchiveTasksAction {
    type: TaskActionType.ARCHIVE_TASKS,
    payload: number[] | ITask[]
}

export interface UnarchiveTasksAction {
    type: TaskActionType.UNARCHIVE_TASKS,
    payload: number[] | ITask[]
}

export interface RefreshRecurrencesAction {
    type: TaskActionType.REFRESH_RECURRENCES,
    payload: Dictionary<never>
}

export interface RehydrateAction {
    type: TaskActionType.REHYDRATE,
    payload: Dictionary<never>
}

export type TaskAction = CreateTaskAction
    | UpdateFileInstanesAction
    | DeleteTaskAction
    | UpdateTaskAction
    | DeleteFileAction
    | RenameFileAction
    | CompleteTaskAction
    | UncompleteTaskAction
    | ArchiveTasksAction
    | UnarchiveTasksAction
    | RefreshRecurrencesAction
    | RehydrateAction;

export const addInstancesFromFile = (
    path: string,
    instances: ITaskInstanceRecord
): UpdateFileInstanesAction => ({
    type: TaskActionType.UPDATE_FILE_INSTANCES,
    payload: { path, instances }
});

export const createTask = ( task: ITask | CreateProps<Task> ): CreateTaskAction => {
    const props: ITaskCreate = {
        name: task.name
    };
    if (task.id)
        props.id = task.id;
    if ('created' in task)
        props.created = task.created
    if ('complete' in task)
        props.complete = task.complete;
    if (task.completedDate)
        props.completedDate = task.completedDate;
    props.tags = []
    if (task.tags)
        props.tags = task.tags.map(t => typeof t === 'string' ? t : t.getId());
    props.content = task.content ?? '';

    return {
        type: TaskActionType.CREATE_TASK,
        payload: props
    };
}