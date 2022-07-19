import { ITask } from './redux/orm';

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
    field: keyof ITask;
    op: Operator,
    value: Omit<ITask, 'instance'>[keyof Omit<ITask,'instances'>];
}


export type TaskQuery = TaskQueryBlock | { and: (TaskQueryBlock | TaskQuery)[] } | { or: (TaskQueryBlock | TaskQuery)[] };

export const isQueryBlock = (tq: TaskQuery): tq is TaskQueryBlock => tq.hasOwnProperty('field');