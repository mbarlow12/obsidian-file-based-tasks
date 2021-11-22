export const TaskRecordType = '--TASK--';

export enum TaskStatus {
    TODO = 'TODO',
    DONE = 'DONE'
}

export interface IAnonymousTask {
    name: string;
    status: TaskStatus;
    locations?: TaskLocation[];
    parents?: IAnonymousTask[];
    children?: IAnonymousTask[];
}

export interface Yamlable {
    yamlObject: unknown & Object;
}

export type TaskYamlObject = {
    [k in keyof Omit<ITask, 'description'>]: ITask[k] extends Array<any> ? string[] : string;
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

export interface FileTaskLine extends Array<number | IAnonymousTask> {
    0: number,
    1: IAnonymousTask,
    length: 2
}

export interface ITask extends IAnonymousTask {
    locations: TaskLocation[];
    created: Date;
    updated: Date;
    description?: string;
    parents?: ITask[];
    children?: ITask[];
}