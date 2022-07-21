import { Model, Ref } from 'redux-orm';

export type RefFilter<T extends Model> = (arg: Ref<T>) => boolean;

export interface ITaskBase {
    id: number;
    name: string;
    complete: boolean;
    tags: string[];
    completed?: number;
}

export interface IBaseTask extends ITaskBase {
    content: string;
    created: number;
    parentIds: number[];
    childIds: number[];
}

export interface ITaskInstance extends ITaskBase {
    rawText: string;
    filePath: string;
    line: number;
    parentLine: number;
    parentInstance?: ITaskInstance;
    childLines: number[];
    instanceChildren?: ITaskInstance[];
    dueDate?: number;
    links: string[];
}

export interface ITask extends IBaseTask {
    dueDate: number;
    instances: ITaskInstance[];
}

export type ITaskCreate = Omit<Partial<ITask>, 'name'> & { name: string };

export type ITaskInstanceRecord = Record<string, ITaskInstance>;
export type FileITaskInstanceRecord = Record<number, ITaskInstance>;

