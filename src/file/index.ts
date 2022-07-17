import { Parser } from '../parse/Parser';
import { ITask, ITaskInstance } from '../redux/orm';

export { taskToTaskFileContents } from './render';
export { taskAsChecklist } from './render';
export { taskFileLine } from './render';
export { taskToYamlObject } from './render';
export { TaskRecordType } from './types';
export { TaskYamlObject } from './types';
export { YamlObject } from './types';
export { TaskInstanceYamlObject } from './types';
export const taskToBasename = ( task: ITaskInstance | ITask ) => `${Parser.normalizeName( task.name )} (${task.id})`;
export const taskToFilename = ( task: ITaskInstance | ITask ) => `${taskToBasename( task )}.md`;