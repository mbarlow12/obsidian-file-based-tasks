import {IAnonymousTask, TaskStatus} from "../Task";

export type TreeNode<T> = {
    [k in keyof T]: T[k]
}

export type TH = Pick<IAnonymousTask, 'name'|'status'> & {children?: string[]};
export type TaskTreeNode = TreeNode<TH>;

// export type TaskTreeNode = Pick<IAnonymousTask, 'name'|'status'> & { children?: string []} &
//     {
//         [k in 'name'|'status'|'children']: TaskTreeNode[k]
//     }

export type TaskTree = Record<string, TaskTreeNode>;

export interface FileTaskCache {
    locations: Record<number, string>;
    hierarchy: TaskTree;
}

export enum DiffType {
    ADD_TASK = 'ADD_TASK',
    REMOVE_TASK = 'REMOVE_TASK',
    UPDATE_TASK = 'UPDATE_TASK',
    ADD_CHILD = 'ADD_CHILD',
    REMOVE_CHILD = 'REMOVE_CHILD',
}

export interface TaskDiff {
    type: DiffType,
    data: TaskTreeNode
}

export type FileTaskDiff = Record<string, TaskDiff>

/**
 * The goal is to offer more detail to the index as to what changes need to be made.
 * - if a line is indented/unindented -> parent now has a child added, SWAP?
 *
 */