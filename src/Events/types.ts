import {IndexedTask} from "../Task";
import {LineTask} from "../Store/TaskStore";

export enum EventType {
    REQUEST_UPDATE_INDEX = 'obsidian-file-tasks:request-index-update',
    INDEX_UPDATE = 'obsidian-file-tasks:index-update',
    FILE_CACHE_UPDATE = 'obsidian-file-tasks:file-cache-update',
    BACKLOG_UPDATE = 'obsidian-file-tasks:backlog-update',
    REQUEST_DELETE_TASK = 'obsidian-file-tasks:delete-task',
    REQUEST_DELETE_FILE = 'obsidian-file-tasks:delete-file',
}

export enum UpdateType {
    CREATE = 'create',
    DELETE = 'delete',
    MODIFY = 'modify',
}

export interface TasksDeleted {
    type: UpdateType.DELETE;
    data: IndexedTask[]
}

export interface TaskModifiedData {
    index: Record<number, IndexedTask>;
    taskState: Record<string, LineTask>
}

export interface TasksModified {
    type: UpdateType.MODIFY,
    data: TaskModifiedData
}

export interface TasksCreated {
    type: UpdateType.CREATE;
    data: IndexedTask[];
}

export type IndexUpdatedAction = TasksCreated | TasksModified | TasksDeleted;
