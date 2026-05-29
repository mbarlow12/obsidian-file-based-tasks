import { OldTaskInstance } from "task/types";
import { OldTask } from "task/types";

export type SerializedITask = [
    number, // id
    string, // name
    boolean, // complete
    string[], // tags
    number | null, // completed
    string, // content
    number, // created
    number[], // parentIds
    number[], // childIds
    number, // dueDate
    number[], // instances
]
export type TaskSerializer = (task: OldTask) => SerializedITask

export type SerializedITaskInstance = [
    number, // id
    string, // name
    boolean, // complete
    string[], // tags
    number | null, // completed
    string, // rawText
    string, // filePath
    number, // line
    number, // parentLine
    number | null, // parentInstance
    number[], // childLines
    number[], // instanceChildren
    number | null, // dueDate
    string[], // links
]
export type TaskInstanceSerializer = (task: OldTaskInstance) => SerializedITaskInstance

export type ITaskCreate = Omit<Partial<OldTask>, 'name'> & { name: string };

export type ITaskInstanceRecord = Record<string, OldTaskInstance>;
export type FileITaskInstanceRecord = Record<number, OldTaskInstance>;