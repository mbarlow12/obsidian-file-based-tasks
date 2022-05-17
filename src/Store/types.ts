import { ListItemCache } from 'obsidian';
import { RRule } from 'rrule';
import { IndexedTask, TaskID } from '../Task';

export interface LineTask extends ListItemCache {
    name: string;
    uid: number;
    complete: boolean;
    recurrence?: RRule;
    dueDate?: Date;
    tags: string[];
    originalTaskText?: string;
}

export type State = Record<string, LineTask>;
export type TaskIndex = Record<TaskID, IndexedTask>