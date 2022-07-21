import { ITask, ITaskInstance } from '../types';

export { Task } from './task.model';
export { TaskInstance } from './instance.model';
export { Tag, tagsEqual } from './tag.model';
export type { TaskProps, TaskFields } from './task.model';
export type { MinInstanceProps, InstanceProps, InstanceFields } from './instance.model';
export type { TagFields } from './tag.model';

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