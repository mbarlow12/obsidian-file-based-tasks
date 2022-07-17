import { ITask, ITaskInstance } from '../redux/orm';

export const TaskRecordType = '--TASK--';

export type YamlObject<T, TOmit extends string | number | symbol> = {
    [k in keyof Omit<T, TOmit>]: T[k] extends Array<infer R> ? R extends string ? Array<string> : Array<YamlObject<R, keyof R>> : string;
}

export type TaskYamlObject = YamlObject<ITask, 'content'> & {
    type: typeof TaskRecordType
}
export type TaskInstanceYamlObject = YamlObject<ITaskInstance, 'tags' | 'dueDate' | 'id' | 'name'>