import { ListItemCache } from "obsidian";
import { RRule } from "rrule";

export const TaskRecordType = '--TASK--';

export type Char =
            'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm' | 'n' | 'o' | 'p' | 'q' | 'r' |
            's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '0' |
            '-' | '_' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P' |
            'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';

export type NonEmptyString = `${Char}${string}`

interface TaskInstanceBase extends ListItemCache {
    uid?: number;
    name: string;
    complete: boolean;
    recurrence?: RRule;
    dueDate?: Date;
    tags?: string[];
    links?: string[];
    rawText: string;
    filePath: string;
    primary: boolean;
    completedDate?: Date;
}

export interface ITaskInstance extends TaskInstanceBase {
    primary: false;
}

export interface PrimaryTaskInstance extends TaskInstanceBase {
    primary: true,
    created: Date,
    updated: Date,
}

export type TaskInstance = ITaskInstance | PrimaryTaskInstance;

export type TaskLocation = {
    filePath: string;
    line: number;
}

export type Task = Omit<TaskInstance, 'position'|'parent'|'task'|'filePath'|'rawText'|'primary'> & {
    uid: TaskUID;
    childUids: number[];
    parentUids: number[];
    created: Date;
    updated: Date;
    instances: TaskInstance[];
    description: string;
}

export type TaskYamlObject = YamlObject<Task, 'description'|'instances'> & {
    type: typeof TaskRecordType
    instances: TaskInstanceYamlObject[]
}

export type TaskInstanceYamlObject = YamlObject<TaskInstance, 'tags'|'dueDate'|'recurrence'|'uid'|'id'|'name'>


export type YamlObject<T, TOmit extends string|number|symbol> = {
    [k in keyof Omit<T, TOmit>]: T[k] extends Array<unknown> ? string[] : string;
}


export type TaskUID = number;

/**
 *  {
 *      [file path]: {
 *          parent: number,
 *          position: Pos
 *      }
 *  }
 */
export type TaskFileLocationRecord = Record<string, TaskFileLocation>;

export type TaskFileLocation = Omit<ListItemCache, 'task'|'id'>;

export type MinTaskLocation = Pick<TaskLocation, 'filePath'> & { line: number };
export type ParsedTask = Omit<TaskInstance, 'task'|'parent'|'position'|'filePath'>