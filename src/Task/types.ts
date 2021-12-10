export const TaskRecordType = '--TASK--';

export interface Yamlable {
    yamlObject: unknown & Object;
}

export type TaskYamlObject = {
    [k in keyof Omit<ITask, 'description'>]: ITask[k] extends Array<any> ? string[] : string;
} & {
    complete: 'true'|'false'
}

export interface TaskList {
    tasks: Record<string, ITask>;
    createItem: (name: string) => void;
    deleteItem: (nameOrId: string) => void;
    completeItem: (nameOrId: string) => void;
    moveItem: (nameOrId: string, destination: string) => void;
}

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
    name: string;
    complete: boolean;
    locations: TaskLocation[];
    created: number;
    updated: number;
    description?: string;
    children: string[];
    childRefs?: ITask[];
}

export type BaseTask = Pick<ITask, 'name'|'complete'>;