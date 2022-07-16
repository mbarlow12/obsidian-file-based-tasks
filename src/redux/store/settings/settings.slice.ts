import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { PluginSettings, SettingsPayload } from './settings.types';

export const DEFAULT_SETTINGS: PluginSettings = {
    tabSize: 4,
    ignoredPaths: [ 'templates' ],
    maxTasks: 500,
    minTaskId: 0,
    indexFiles: {
        'Backlog.md': {
            filter: t => !t.ref.complete,
            sort: ( a, b ) => a.ref.created.getTime() - b.ref.created.getTime()
        },
        'Completed.md': {
            filter: t => t.ref.complete,
            sort: ( a, b ) => a.ref.created.getTime() - b.ref.created.getTime()
        }
    },
    timeBeforeArchive: 45,
    deleteSubtaskWithTask: false,
    parseOptions: {
        taskNameInclusive: false,
        taskPrefix: '#task',
        usePrefix: false,
        tokens: {
            tag: '#',
            recurrence: '&',
            dueDate: '@'
        }
    }
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

export const { updated, reset } = settingsSlice.actions;
export type SettingsAction = ReturnType<typeof updated> | ReturnType<typeof reset>

export default settingsSlice.reducer;