import { OrmState } from 'redux-orm';
import { TaskORMSchema } from './orm';
import { PluginSettings } from './settings';

export type PluginState = {
    settings: PluginSettings,
    taskDb: OrmState<TaskORMSchema>
}