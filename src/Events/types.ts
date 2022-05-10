import {ITask} from "../Task";

export enum EventType {
    REQUEST_UPDATE_INDEX = 'obsidian-file-tasks:request-index-update',
    INDEX_UPDATE = 'obsidian-file-tasks:index-update',
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
    data: ITask[]
}

export interface TasksModified {
    type: UpdateType.MODIFY,
    data: {
        index: Record<number, ITask>,
        locations: Record<string, number>
    }
}

export interface TasksCreated {
    type: UpdateType.CREATE;
    data: ITask[];
}

export type IndexUpdatedAction = TasksCreated | TasksModified | TasksDeleted;
