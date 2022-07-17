import { ITaskInstance } from '../redux/orm';

export type ParsedTask = Omit<ITaskInstance, 'task' | 'parentLine' | 'line' | 'childLines' | 'filePath' | 'parentLines'>