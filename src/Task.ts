import {TFolder} from "obsidian";

export const TaskRecordType = '--TASK_FILE--';

export enum TaskStatus {
    TODO = 'TODO',
    DONE = 'DONE'
}

export enum iTaskStatus {
    TODO = 'O',
    DONE = 'X'
}

export interface BaseTask {
    name: string;
    status: TaskStatus;
    parents?: Task[];
    children?: Task[];
    locations: TaskLocation[];
}

export interface Task extends BaseTask {
    id: number;
    created: Date;
    updated: Date;
    description?: string;
    duplicates?: Task[];
}

export interface TaskList {
    tasks: Record<string, Task>;
    createItem: (name: string) => void;
    deleteItem: (nameOrId: string) => void;
    completeItem: (nameOrId: string) => void;
    moveItem: (nameOrId: string, destination: string) => void;
}

export interface TaskLocation {
    filePath: string;
    line: number;
}
/*
create task file
get task template

what's the goal? what's the mvp?
- just need to manipulate a backlog and completed file in response to creation, deletion, checking/unchecking of a task
- ensure its consistent and without duplicates
 */