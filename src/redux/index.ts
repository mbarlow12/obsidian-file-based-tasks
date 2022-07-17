import { configureStore } from '@reduxjs/toolkit';
import { ITaskInstance, reducerCreator, TaskAction } from './orm';
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
export const hashTaskInstance = (
    { name, id, complete, parentLine, dueDate, childLines, tags, filePath, line }: ITaskInstance
): string => [ line, id, name, complete ? 'x' : ' ', parentLine, dueDate.getTime(), filePath, ...tags.sort(), ...childLines.sort() ].join( '||' );

export const taskUidToId = ( uid: number ) => uid.toString( 16 );

export const taskIdToUid = ( id: string ) => isNaN( Number.parseInt( id, 16 ) ) ? 0 : Number.parseInt( id, 16 );