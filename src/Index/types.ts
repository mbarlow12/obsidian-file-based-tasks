import {IndexedTask, LocationString, TaskID, TaskLocation} from "../Task";

export interface TaskIndex {
    tasks: Record<TaskID, IndexedTask>;
    locations: Record<LocationString, number>
    parents: Record<TaskID, Record<TaskID, TaskLocation>>;
    nextID: TaskID;
}