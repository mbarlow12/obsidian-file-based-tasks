import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Ref } from 'redux-orm';
import { ParserSettings } from '../../parse/Parser';
import { Task } from '../orm';
import { PluginSettings, RenderOpts, SettingsPayload } from './settings.types';

export const DEFAULT_PARSER_SETTINGS: ParserSettings = {
    tokens: {
        tag: '#',
        recurrence: '&',
        dueDate: '@',
        divider: '|*|'
    },
    prefix: ''
};
export const DEFAULT_RENDER_OPTS: RenderOpts = {
    id: true,
    links: false,
    primaryLink: true,
    tags: true,
    recurrence: true,
    dueDate: true,
    completedDate: true,
    strikeThroughOnComplete: false
};

export const DEFAULT_SETTINGS: PluginSettings = {
    tabSize: 4,
    ignoredPaths: [ 'templates' ],
    maxTasks: 500,
    minTaskId: 1000,
    indexFiles: {
        'Backlog.md': ( row: Ref<Task>) => !row.complete,
        'Completed.md': ( row: Ref<Task>) => row.complete
    },
    timeBeforeArchive: 45,
    deleteSubtaskWithTask: false,
    tasksDirectory: 'tasks',
    parseOptions: {
        taskNameInclusive: false,
        taskPrefix: '#task',
        usePrefix: false,
        tokens: {
            tag: '#',
            recurrence: '&',
            dueDate: '@'
        }
    },
    renderOptions: DEFAULT_RENDER_OPTS,
};
export const settingsSlice = createSlice( {
    name: 'pluginSettings',
    initialState: DEFAULT_SETTINGS,
    reducers: {
        updated: ( state, action: PayloadAction<SettingsPayload> ) => {
            return {
                ...state,
                ...action.payload
            };
        },
        reset: () => {
            return { ...DEFAULT_SETTINGS };
        }
    }
} );
export type SettingsAction = ReturnType<typeof updated> | ReturnType<typeof reset>
export const { updated, reset } = settingsSlice.actions;
export default settingsSlice.reducer;
