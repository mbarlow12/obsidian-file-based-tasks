import { Task, TaskInstance, TaskUID } from "../Task";

export enum EventType {
    REQUEST_UPDATE_INDEX = 'obsidian-file-tasks:request-index-update',
    INDEX_UPDATED = 'obsidian-file-tasks:index-update',
    FILE_CACHE_UPDATE = 'obsidian-file-tasks:file-cache-update',
    REQUEST_SETTINGS_UPDATE = 'obsidian-file-tasks:request-settings',
    SETTINGS_UPDATE = 'obsidian-file-tasks:settings-update',
    BACKLOG_UPDATE = 'obsidian-file-tasks:backlog-update',
    REQUEST_DELETE_TASK = 'obsidian-file-tasks:delete-task',
    REQUEST_DELETE_FILE = 'obsidian-file-tasks:delete-file',
}

export enum ActionType {
    CREATE_TASK = 'create',
    DELETE_TASK = 'delete_task',
    MODIFY_TASK = 'modify-task',
    DELETE_TASKS = 'delete-tasks',
    MODIFY_FILE_TASKS = 'modify-file-tasks',
    RENAME_FILE = 'rename-file',
    DELETE_FILE = 'delete-file'
}

export interface DeleteTaskAction {
    type: ActionType.DELETE_TASK;
    data: { uid: number };
}

export interface CreateTaskAction {
    type: ActionType.CREATE_TASK;
    data: TaskInstance;
}

export interface ModifyTaskAction {
    type: ActionType.MODIFY_TASK,
    data: Task
}

export interface DeleteTasks {
    type: ActionType.DELETE_TASKS;
    data: TaskUID[]
}

export interface ModifyFileTasks {
    type: ActionType.MODIFY_FILE_TASKS,
    data: TaskInstance[],
}

export interface DeleteFile {
    type: ActionType.DELETE_FILE,
    data: string
}

export interface RenameFile {
    type: ActionType.RENAME_FILE,
    data: { oldPath: string, newPath: string }
}

export type IndexUpdateAction =
    DeleteTaskAction
    | CreateTaskAction
    | ModifyTaskAction
    | DeleteTasks
    | ModifyFileTasks
    | DeleteFile
    | RenameFile

export type FileCacheUpdateHandler = ( action: IndexUpdateAction ) => void