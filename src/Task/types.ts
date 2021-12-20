export const TaskRecordType = '--TASK--';

export interface Yamlable {
    yamlObject: unknown & Object;
}

export type TaskYamlObject = {
    [k in keyof Omit<ITask, 'description'>]: ITask[k] extends Array<any> ? string[] : string;
} & {
    complete: 'true'|'false'
}

export type TaskID = number;

/**
 * `[file path with extension]:[line number]`
 */
export type LocationString = string;

/**
 * todo: add block creation and handling
 */
export interface TaskLocation {
    filePath: string;
    line: number;
    blockId?: string;
}

export type TaskFileRecord = Record<number, ITask>;

export interface FileTaskLine extends Array<number | ITask> {
    0: number,
    1: ITask,
    length: 2
}

export interface ITask {
    id: number;
    name: string;
    complete: boolean;
    locations?: TaskLocation[];
    created: number;
    updated: number;
    description?: string;
    children: number[];
    childRefs?: ITask[];
}

export interface DisplayTask {
    id: number;
    name: string;
    complete: boolean;
    location: TaskLocation;
    parent?: ITask;
}

export type AnonymousDisplayTask = Omit<DisplayTask, 'id'>;

export type BaseTask = Pick<ITask, 'name'|'complete'>;