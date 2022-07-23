// noinspection ES6UnusedImports
import { QuerySet } from 'redux-orm';
import { IndexFileSettings } from '../orm';

export interface ParseOptions {
    usePrefix: boolean;
    taskPrefix: string;
    tokens: {
        tag: string;
        recurrence: string;
        dueDate: string;
    },
    taskNameInclusive: boolean; // if true, the whole line will be the 'name' except the id and  task file link
}

export type PluginSettings = {
    tabSize: number,
    ignoredPaths: string[],
    maxTasks: number,
    deleteSubtaskWithTask: boolean,
    timeBeforeArchive: number,
    indexFiles: IndexFileSettings,
    minTaskId: number,
    parseOptions: ParseOptions,
    renderOptions?: RenderOpts,
    tasksDirectory: string;
}
export type SettingsPayload = Partial<PluginSettings>;

export interface RenderOpts {
    id: boolean,
    links: boolean,
    primaryLink: boolean,
    tags: boolean,
    recurrence: boolean,
    dueDate: boolean,
    showCompletedDate: boolean,
    strikeThroughOnComplete: boolean,
}