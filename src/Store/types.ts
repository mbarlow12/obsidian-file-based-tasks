import { PrimaryTaskInstance, Task, TaskInstance, TaskUID } from '../Task';

export type TaskInstanceIndex = Record<string, TaskInstance|PrimaryTaskInstance>;
export type TaskIndex = Record<TaskUID, Task>
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
export type IndexTask = Omit<Task, 'instances'>