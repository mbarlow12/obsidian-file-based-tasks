import {CachedMetadata} from "obsidian";
import {DiffType, FileTaskCache, FileTaskDiff, TaskTree, TaskTreeNode} from "./types";
import TaskParser from "../TaskParser";
import {IAnonymousTask, TaskLocation, TaskStatus} from "../Task";
import {entries, isEqual} from "lodash";

function hasOwnProperty<X extends {}, Y extends PropertyKey>(obj: X, prop: Y): obj is X & Record<Y, unknown> {
    return obj.hasOwnProperty(prop)
}

const isArray = <T>(x: unknown): x is Array<T> | undefined => {
    return x === undefined || Array.isArray(x);
};

const isDate = (x: unknown): x is Date => {
    return Object.prototype.toString.call(x) === '[object Date]';
};

const isObject = (x: unknown): x is Object => {
    return typeof x === 'object';
}

const isAnonymousTask = (x: unknown): x is IAnonymousTask => {
    if (!(hasOwnProperty(x, 'name') && typeof x.name === 'string'))
        return false;
    if (!(hasOwnProperty(x, 'status') && (x.status === TaskStatus.DONE || x.status === TaskStatus.TODO)))
        return false
    return true;
}

const isTreeNode = (x: unknown): x is TaskTreeNode => {
    if (!(hasOwnProperty(x, 'name') && typeof x.name === 'string'))
        return false;
    if (!(hasOwnProperty(x, 'status') && (x.status === TaskStatus.DONE || x.status === TaskStatus.TODO)))
        return false
    if (hasOwnProperty(x, 'children') && (!Array.isArray(x.children) || x.children.filter(c => typeof c !== 'string').length > 0))
        return false;
    return true;
}

const isTerminal = (x: unknown): boolean => {
    return !isTreeNode(x);
};

export enum DiffStatus {
    UNCHANGED = 'UNCHANGED',
    UPDATED = 'UPDATED',
    CREATED = 'CREATED',
    REMOVED = 'REMOVED',
}

export const compareValues = (a: unknown, b: unknown) => {
    if (a === b) {
        return DiffStatus.UNCHANGED;
    }
    if (isDate(a) && isDate(b) && a.getTime() === b.getTime())
        return DiffStatus.UNCHANGED;
    if (a === undefined)
        return DiffStatus.CREATED;
    if (b === undefined)
        return DiffStatus.REMOVED;
    if (isArray(a) && isArray(b)) {

    }
};

interface Diff<T> {
    type: DiffStatus,
    data: T
}

type Arg = string | TaskStatus | Array<string> | undefined;

export const diffTasks = <T extends Arg>(task1: T, task2: T): Diff<T> | Array<Diff<string>> => {
    if (isArray<string>(task1) && isArray<string>(task2)) {
        const arrDiff: Array<Diff<string>> = [];
        if (!task1 && task2)
            arrDiff.push(...task2.map(t2 => ({type: DiffStatus.CREATED, data: t2})));
        if (task1 && !task2)
            arrDiff.push(...task1.map(t1 => ({type: DiffStatus.REMOVED, data: t1})));
        return arrDiff;
    }

    // if (!isTreeNode(task1) && !isTreeNode(task2)) {
    //     return {
    //         type: compareValues(task1, task2),
    //         data: task2 ?? task1
    //     }
    // }

    return {
        type: compareValues(task1, task2),
        data: task2 ?? task1
    };
}

function symmetricDifference<T>(setA?: Set<T> | Array<T>, setB?: Set<T> | Array<T>): Set<T> {
    if (setA === undefined) return new Set(setB || []);
    if (setB === undefined) return new Set(setA || []);

    let _difference = new Set(setA)
    setB = setB instanceof Set ? setB : new Set(setB);
    for (let elem of setB) {
        if (_difference.has(elem)) {
            _difference.delete(elem)
        } else {
            _difference.add(elem)
        }
    }
    return _difference
}

export const getHierarchyDiff = (a: TaskTree, b: TaskTree): FileTaskDiff => {
    const diff: FileTaskDiff = {};
    for (const aName in a) {
        if (!(aName in b)) {
            // this task was deleted in b
            diff[aName] = {
                type: DiffType.REMOVE_TASK,
                data: a[aName]
            };
        } else {
            // task exists in both a and b, check for changes
            // only register a diff if status has changed or children added/removed
            const nodeA = a[aName];
            const nodeB = b[aName];
            if (nodeA.status !== nodeB.status)
                diff[aName] = {type: DiffType.UPDATE_TASK, data: nodeB};

            const childDiff = symmetricDifference<string>(nodeA.children, nodeB.children);
            if (childDiff.size > 0)
                diff[aName] = {type: DiffType.UPDATE_TASK, data: nodeB};
        }
    }

    // check for tasks in b that are not in a
    for (const bName in b) {
        if (!(bName in a)) {
            diff[bName] = {type: DiffType.ADD_TASK, data: b[bName]};
        }
    }

    return diff;
}

export const getFileTaskCache = (cache: CachedMetadata, fileContents: string): FileTaskCache => {
    const lines = fileContents.split(/\r?\n/g);
    const taskIndex: Record<number, IAnonymousTask> = {};
    const tree: TaskTree = {};
    // add parent/child relationships if they exist
    for (const cacheListItem of cache.listItems || []) {
        // skip list items that are not tasks
        if (!cacheListItem.task)
            continue;

        const taskLine = cacheListItem.position.start.line;
        const task = TaskParser.parseLine(lines[taskLine]);
        if (!task) {
            throw new Error(`No task found at ${taskLine}.`);
        }
        taskIndex[taskLine] = task;
        if (!(task.name in tree)) {
            tree[task.name] = {
                name: task.name,
                status: task.status
            };
        }

        if (cacheListItem.parent >= 0) {
            // this list item has a parent
            const parentLine = cacheListItem.parent;
            if (!(parentLine in taskIndex)) {
                // this implies that a subtask is nested under a list item that is not
                // a task
                // add this to the tree
                continue;
            }
            // this task is a subtask
            taskIndex[parentLine].children = [...(taskIndex[parentLine].children || []), task];
        }

        for (const lineNumber in taskIndex) {
            const anonTask = taskIndex[lineNumber];
            if (anonTask.name in tree) {
                if (anonTask.children)
                    tree[anonTask.name].children = [...anonTask.children.map(c => c.name)]
                // tree[anonTask.name] = {
                //     task: anonTask,
                //     children: [...(tree[anonTask.name].children || []), ...anonTask.children]
                // }
            }
        }
    }
    return {
        locations: entries(taskIndex).reduce((rec, [l, t]) => {
            rec[Number(l)] = t.name;
            return rec;
        }, {} as Record<number, string>),
        hierarchy: tree
    };
}