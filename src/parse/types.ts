import { ITaskInstance } from '../redux/orm';

export type ParsedTask = Pick<ITaskInstance, 'name' | 'id' | 'complete' | 'completedDate' | 'dueDate' | 'tags' | 'links' | 'rawText'>