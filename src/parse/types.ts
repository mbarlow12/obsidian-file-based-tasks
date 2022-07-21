import { ITaskInstance } from '../redux/orm';

export type ParsedTask = Pick<ITaskInstance, 'name' | 'id' | 'complete' | 'completed' | 'dueDate' | 'tags' | 'links' | 'rawText'>