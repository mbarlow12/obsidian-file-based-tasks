import { FileManagerSettings } from './File/TaskFileManager';
import { ParserSettings } from './Parser/TaskParser';
import { Task } from './Task';

export interface TaskManagerSettings {
    taskDirectoryName: string;
    taskTitlePrefix?: string;
    backlogFileName?: string;
    completedFileName?: string;
    taskPrefix?: string;
    parserSettings: ParserSettings;
    fileManagerSettings: FileManagerSettings;
    indexFiles?: Map<string, TaskQuery>;
    ignoredPaths?: string[];
}

export enum Operator {
    EQ = 'EQ',
    GT = 'GT',
    GTE = 'GTE',
    LT = 'LT',
    LTE = 'LTE',
    NE = 'NE',
    LIKE = 'LIKE',
    INCLUDES = 'INCLUDES',
}

export interface TaskQueryBlock {
    field: keyof Task;
    op: Operator,
    value: Omit<Task, 'locations'>[keyof Omit<Task,'locations'>];
}


export type TaskQuery = TaskQueryBlock | { and: (TaskQueryBlock | TaskQuery)[] } | { or: (TaskQueryBlock | TaskQuery)[] };

export const isQueryBlock = (tq: TaskQuery): tq is TaskQueryBlock => tq.hasOwnProperty('field');