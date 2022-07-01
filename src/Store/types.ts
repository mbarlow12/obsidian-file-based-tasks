import { PrimaryTaskInstance, Task, TaskInstance, TaskLocation, TaskUID } from '../Task';

export type TaskInstanceIndex = Map<TaskLocation, TaskInstance|PrimaryTaskInstance>;
export type MTaskInstanceIndex = Map<string, TaskInstanceIndex|PrimaryTaskInstance>;
export type TaskIndex = Map<TaskUID, Task>;
export type MTaskIndex = Map<TaskUID, Task>;
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