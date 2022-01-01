import {BaseTask, ITask, ITaskTree} from "../Task";
import {ListItemCache} from "obsidian";

export interface TaskCacheItem {
    id?: number;
    name: string;
    complete: boolean;
    parent: number;
    lineNumber: number;
    parentName?: string;
    parentId?: number;
}

export type FileTaskRecord = Record<number, ITask>;

export type HierarchyItem = Pick<TaskCacheItem, 'name' | 'complete' | 'parentId' | 'id' | 'parent'>;

export type FileTaskCache = Record<number, TaskCacheItem>;

export type TaskHierarchy = Array<HierarchyItem>;

export type TreeNode<T> = {
    [k in keyof T]: T[k]
}

export type TH = Pick<BaseTask, 'name'|'complete'> & {children?: string[]};
export type TaskTreeNode = TreeNode<TH>;

export type TaskTree = Record<string, ITaskTree>;

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