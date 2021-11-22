import {IAnonymousTask} from "../Task";

export interface FileTaskTreeNode {
    task: IAnonymousTask;
    children: IAnonymousTask[];
}