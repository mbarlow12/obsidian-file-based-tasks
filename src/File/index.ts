import {CachedMetadata, TFile} from "obsidian";
import {FileTaskCache, TaskTree} from "./types";
import TaskParser from "../TaskParser";
import {BaseTask, ITask} from "../Task";
import {entries} from "lodash";
import {hash} from "../util/hash";
import globals from "../globals";

const {app, vault, fileManager} = globals;

export const hashTaskCache = async ({locations, hierarchy}: FileTaskCache): Promise<string> => {
    const sortedLocs = Object.keys(locations).sort().reduce((carry, k) => {
        const key = Number.parseInt(k);
        carry[key] = locations[key];
        return carry;
    }, {} as Record<number, string>);
    const msg = JSON.stringify({locations: sortedLocs, hierarchy});
    return await hash(msg);
}

export const getFileTaskCache = (cache: CachedMetadata, fileContents: string): FileTaskCache => {
    const lines = fileContents.split(/\r?\n/g);
    const taskIndex: Record<number, BaseTask> = {};
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
                complete: task.complete,
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

export const getTasksFromFile = (file: TFile): IAnonymousTask[] => {
    const ret: ITask = {
        name: 'name',
        status: TaskStatus.TODO,
        created: new Date(),
        updated: new Date(),
        locations: [],
        parents: [],
        children: [],
    }
    return [ret];
};