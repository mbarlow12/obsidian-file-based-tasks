import { configureStore, EnhancedStore } from '@reduxjs/toolkit';
import { reducerCreator, TaskAction } from './orm';
import { isTaskAction } from './orm/actions';
import { fetchOrm } from './orm/schema';
import { SettingsAction } from './settings';
import settings from './settings/settings.slice';
import { PluginState } from './types';

const { orm, state } = fetchOrm();
const taskDb = reducerCreator( orm, state );
export {
    orm,
    state
};

const reducer = (
    state: PluginState,
    action: TaskAction
) => {
    let taskState = state.taskDb;
    if (isTaskAction(action))
        taskState = taskDb(state, action);
    return {
        settings: settings(state.settings, action),
        taskDb: taskState
    };
}

const store: EnhancedStore<PluginState, TaskAction|SettingsAction> = configureStore( {
    reducer,
} );

export default store;


export type RootState = ReturnType<typeof reducer>;
export type AppDispatch = typeof store.dispatch;