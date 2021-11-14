import {ITask, Task} from "../Task";

export enum EventType {
    REQUEST_UPDATE_INDEX = 'obsidian-file-tasks:request-index-update',
    INDEX_UPDATE = 'obsidian-file-tasks:index-update',
    BACKLOG_UPDATE = 'obsidian-file-tasks:backlog-update',
}

export enum UpdateType {
    CREATE = 'create',
    DELETE = 'delete',
    MODIFY = 'modify',
}

export interface TasksDeleted {
    type: UpdateType.DELETE;
    data: ITask[]
}

export interface TasksModified {
    type: UpdateType.MODIFY,
    data: Task[]
}

export interface TasksCreated {
    type: UpdateType.CREATE;
    data: Task[];
}

export type IndexUpdatedAction = TasksCreated | TasksModified | TasksDeleted;