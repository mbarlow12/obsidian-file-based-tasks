import { Task, TaskInstance, TaskUID } from '../Task';

export type TaskInstanceIndex = Map<string, TaskInstance>;
export type TaskIndex = Map<TaskUID, Task>;
export type TaskStoreState = {
    instanceIndex: TaskInstanceIndex;
    taskIndex: TaskIndex;
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
export type IndexTask = Omit<Task, 'locations'>