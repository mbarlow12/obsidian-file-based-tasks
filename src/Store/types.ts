import { Task, TaskInstance, TaskUID } from '../Task';

export type InstanceIndex = Record<string, TaskInstance[]>;
export type TaskIndex = Record<TaskUID, IndexTask>
export type TaskStoreState = {
    index: TaskIndex,
    instanceIndex: InstanceIndex
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