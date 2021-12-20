import {ITask, LocationString, TaskID, TaskLocation} from "../Task";

export interface TaskIndex {
    // task id: ITask
    tasks: Record<TaskID, ITask>;
    // string: task id
    locations: Record<LocationString, number>
    // task id: { parent task id: parent location, ... }
    parents: Record<TaskID, Record<TaskID, TaskLocation>>;
    nextID: TaskID;
}