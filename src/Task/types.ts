export const TaskRecordType = '--TASK--';

export interface ITask {
    id: number;
    name: string;
    complete: boolean;
    locations?: TaskLocation[];
    created: number;
    updated: number;
    description?: string;
    children: number[];
}

export type ITaskTree = ITask & { children: ITaskTree[] }

export interface DisplayTask {
    id: number;
    name: string;
    complete: boolean;
    location: TaskLocation;
    parent?: DisplayTask;
}

export type AnonymousDisplayTask = Omit<DisplayTask, 'id'|'parent'> & { id?: number, parent?: AnonymousDisplayTask };

export type BaseTask = Pick<ITask, 'name'|'complete'>;

export interface Yamlable {
    yamlObject: unknown & Object;
}

export type TaskYamlObject = {
    [k in keyof Omit<ITask, 'description'>]: ITask[k] extends Array<unknown> ? string[] : string;
} & {
    complete: 'true'|'false'
}

export type TaskID = number;

/**
 * `[file path with extension]:[line number]`
 */
export type LocationString = string;

export interface TaskLocation {
    filePath: string;
    line: number;
    blockId?: string;
}

export interface FileTaskLine extends Array<number | ITask> {
    0: number,
    1: ITask,
    length: 2
}