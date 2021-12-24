import {Pos} from "obsidian";

export const TaskRecordType = '--TASK--';

export interface BaseTask {
    id: number;
    name: string;
    complete: boolean;
}

export interface ITask extends BaseTask{
    locations?: TaskLocation[];
    created: number;
    updated: number;
    description?: string;
    children: number[];
}

export type ITaskTree = Omit<ITask, 'children'> & { children: ITaskTree[] }

export interface DisplayTask {
    id?: number;
    name: string;
    complete: boolean;
    location: TaskLocation;
    parent?: DisplayTask;
}

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
    position: Pos;
}

export interface FileTaskLine extends Array<number | ITask> {
    0: number,
    1: ITask,
    length: 2
}