import { LineTask, State } from '../Store/types';
import { IndexedTask } from "../Task";

export enum EventType {
    REQUEST_UPDATE_INDEX = 'obsidian-file-tasks:request-index-update',
    INDEX_UPDATED        = 'obsidian-file-tasks:index-update',
    FILE_CACHE_UPDATE    = 'obsidian-file-tasks:file-cache-update',
    BACKLOG_UPDATE       = 'obsidian-file-tasks:backlog-update',
    REQUEST_DELETE_TASK  = 'obsidian-file-tasks:delete-task',
    REQUEST_DELETE_FILE  = 'obsidian-file-tasks:delete-file',
}

export enum IndexAction {
    CREATE = 'create',
    DELETE = 'delete',
    MODIFY = 'modify',
    RENAME = 'rename',
}

export interface TasksDeleted {
    type: IndexAction.DELETE;
    data: IndexedTask[]
}

export interface TaskModifiedData {
    index: Record<number, IndexedTask>;
    taskState: Record<string, LineTask>
}

export interface TasksModified {
    type: IndexAction.MODIFY,
    data: TaskModifiedData
}

export interface TasksCreated {
    type: IndexAction.CREATE;
    data: IndexedTask[];
}

export type IndexUpdatedAction = TasksCreated | TasksModified | TasksDeleted;

export type FileCacheUpdateHandler = (fileState: State, action: IndexAction) => void