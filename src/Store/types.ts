import { Task, TaskInstance, TaskUID } from '../Task';

export type FileTaskInstanceIndex = Record<number, TaskInstance>;
export type TaskInstanceIndex = Record<string, FileTaskInstanceIndex>;
export type TaskIndex = Record<TaskUID, IndexTask>
export type TaskStoreState = {
    index: TaskIndex,
    instanceIndex: TaskInstanceIndex
}
/**
 * id,
 * uid,
 * name,
 * complete,
 * recurrence,
 * dueDate,
 * tags,
 * childUid,
 * parentUids,
 * created,
 * updated,
 * description,
 */
export type IndexTask = Omit<Task, 'instances'>