import { configureStore, EnhancedStore } from '@reduxjs/toolkit';
import { reducerCreator, TaskAction } from './orm';
import { isTaskAction } from './orm/actions';
import { fetchOrm } from './orm/schema';
import { DEFAULT_SETTINGS, SettingsAction } from './settings';
import settings from './settings/settings.slice';
import { PluginState } from './types';

const { orm, state: taskDb } = fetchOrm();
const state: PluginState = { settings: DEFAULT_SETTINGS, taskDb };
const taskReducer = reducerCreator( orm, taskDb );
export {
    orm,
    state
};

const reducer = (
    pluginState: PluginState,
    action: TaskAction
) => {
    if (!pluginState)
        return state;
    let taskState = pluginState.taskDb;
    if (isTaskAction(action))
        taskState = taskReducer(pluginState, action);
    return {
        settings: settings(pluginState.settings, action),
        taskDb: taskState
    };
}

const store: EnhancedStore<PluginState, TaskAction|SettingsAction> = configureStore( {
    reducer,
} );

export default store;


export type RootState = ReturnType<typeof reducer>;
export type AppDispatch = typeof store.dispatch;