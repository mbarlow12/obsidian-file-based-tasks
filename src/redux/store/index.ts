import { configureStore } from '@reduxjs/toolkit';
import { reducerCreator, TaskAction } from './orm';
import { isTaskAction } from './orm/actions';
import { fetchOrm } from './orm/schema';
import settings, { SettingsAction } from './settings/settings.slice';
import { PluginState } from './types';


export default function (  ) {
    const { orm, state } = fetchOrm();
    const taskDb = reducerCreator( orm, state );

    const reducer = (
        state: PluginState,
        action: TaskAction | SettingsAction
    ) => {
        let taskState = state.taskDb;
        if (isTaskAction(action))
            taskState = taskDb(state, action);
        return {
            settings: settings(state.settings, action),
            taskDb: taskState
        };
    }

    return configureStore( {
        reducer
    } );
}