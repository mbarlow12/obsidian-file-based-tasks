import { ITask, ITaskInstance } from '../types';

export { Task } from './task.model';
export { TaskInstance } from './instance.model';
export { Tag, tagsEqual } from './tag.model';
export type { TaskProps, TaskFields, MTask } from './task.model';
export type { MinInstanceProps, InstanceProps, InstanceFields, MTaskInstance } from './instance.model';
export type { TagFields, MTag } from './tag.model';

export const MIN_ID = 10000;
export const INSTANCE_KEY_DELIM = '||';
export const instancesKey = (
    pathOrInst: string | ITaskInstance,
    line = 0,
    delimiter = INSTANCE_KEY_DELIM
) => {
    if ( typeof pathOrInst !== 'string' ) {
        line = pathOrInst.line;
        pathOrInst = pathOrInst.filePath;
    }
    return [ pathOrInst, line ].join( delimiter )
};
export const emptyTaskInstance = (): ITaskInstance => {
    return {
        id: 0,
        complete: false,
        name: '',
        parentLine: -1,
        line: 0,
        links: [],
        tags: [],
        rawText: '',
        filePath: '',
        childLines: [],
    };
};
export const emptyTask = (): ITask => {
    const { id, complete, name } = emptyTaskInstance();
    return {
        id,
        name,
        complete,
        created: new Date().getTime(),
        content: '',
        instances: [],
        childIds: [],
        tags: [],
        parentIds: [],
        dueDate: new Date().getTime()
    }
}
export const PLACEHOLDER_ID = -1;

export interface StateTable<T, K extends Array<keyof T> = (keyof T)[]> {
    fields: K;
    key: keyof T;
    items: Array<T[keyof T][]>;
    index: [ string | number, number ][]
}

export interface Simple {
    id: number;
    name: string;
    complete: boolean;
    completed: number;
    created: number;
}

const g: StateTable<Simple> = {
    fields: [ 'id', 'name', 'complete', 'completed', 'created' ],
    key: 'id',
    items: [
        [ 1, 'name 1', false, 1123123, 12313123 ]
    ],
    index: [
        [ 1, 0 ]
    ]
};