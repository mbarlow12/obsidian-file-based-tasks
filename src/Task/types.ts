import {RRule} from "rrule";
import {ListItemCache} from "obsidian";

export const TaskRecordType = '--TASK--';

export type Char =
            'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm' | 'n' | 'o' | 'p' | 'q' | 'r' |
            's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '0' |
            '-' | '_' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P' |
            'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';

export type NonEmptyString = `${Char}${string}`

export interface Task {
    id: string;
    name: string;
    complete: boolean;
    locations: TaskLocation[];
    description: string;
    parentLocations: TaskLocation[];
    recurrence?: RRule;
    dueDate?: Date;
    tags: string[];
}

export interface IndexedTask extends Task {
    uid: number;
    childUids: number[];
    parentUids: number[];
    created: Date;
    updated: Date;
}

export type ChecklistTask = Omit<Task, 'locations' | 'description' | 'parentLocations'>

export interface CacheItemTask extends ListItemCache {
    name: string;
}

export interface Yamlable {
    yamlObject: unknown & Record<string, unknown>;
}

export type TaskYamlObject = {
    [k in keyof Omit<IndexedTask, 'description'>]: IndexedTask[k] extends Array<unknown> ? string[] : string;
} & {
    complete: 'true'|'false',
    type: typeof TaskRecordType,
};

export type TaskID = number;

/**
 * `[file path with extension]:[line number]`
 */
export type LocationString = string;

export interface TaskLocation {
    filePath: string;
    lineNumber: number;
}

export interface FileTaskLine extends Array<number | Task> {
    0: number,
    1: Task,
    length: 2
}