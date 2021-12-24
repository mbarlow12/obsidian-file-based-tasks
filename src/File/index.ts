import {CachedMetadata, ListItemCache, Pos, TFile} from "obsidian";
import {FileTaskCache, TaskCacheItem, TaskHierarchy, TaskTree} from "./types";
import TaskParser from "../Parser/TaskParser";
import {BaseTask, compareArrays, emptyTask, ITask} from "../Task";
import {entries} from "lodash";
import {hash} from "../util/hash";
import globals from "../globals";
import {Obj} from "tern";

const {app, vault, fileManager} = globals;

export const taskCacheItemToTask = (filePath: string, item: TaskCacheItem): ITask => {
    const {name, id, position, complete} = item;
    return {
        ...emptyTask(),
        name, id: Number.parseInt(id), complete, locations: [{filePath, position}]
    };
}

export const fileTaskCacheToTaskList = (filePath: string, cache: FileTaskCache): Record<number, ITask> => {
    return Object.entries(cache).reduce((ret, [ln, cacheItem]) => {
        if (!(ln in ret)) {
            ret[ln] = taskCacheItemToTask(filePath, cacheItem);
        }
        return ret;
    }, {} as Record<number, ITask>);
}

export const hierarchyFromTaskCache = (cache: FileTaskCache): TaskHierarchy => {
    const sorted = Object.entries(cache).sort(([a], [b]) => a - b);
    return sorted.map(([, cacheItem]) => {
        let {name, complete, id, parent, parentId} = cacheItem;
        if (parent >= 0)
            parent = sorted.findIndex(([pLineNum]) => pLineNum === parent);
        return {
            name,
            complete,
            id,
            parent, // parent now index into TaskHierarchy array
            parentId
        };
    });
}

export const getFileTaskCache = (cache: CachedMetadata, contents: string): FileTaskCache => {
    const items: FileTaskCache = {};

    for (const listItem of cache.listItems.filter(li => li.task)) {
        const start = listItem.position.start.offset;
        const end = listItem.position.end.offset;
        const taskLine = contents.slice(start, end);
        const task = TaskParser.parseLine(taskLine);
        if (!task) {
            throw new Error(`No task found at ${taskLine}.`);
        }
        const hasParent = listItem.parent > -1;
        const taskCacheItem: TaskCacheItem = {
            ...listItem,
            name: task.name,
            complete: task.complete,
            parentName: hasParent ? items[listItem.parent].name : '',
            parentId: hasParent ? Number.parseInt(items[listItem.parent].id) : -1,
        };
        items[listItem.position.start.line] = taskCacheItem;
    }

    return items;
};

export const hashTaskCache = async (cache: FileTaskCache): Promise<string> => {
    const sortedItems = Object.entries(cache).sort(([a], [b]) => a - b);
    const msg = JSON.stringify(sortedItems);
    return await hash(msg);
}

export const getTextFromPosition = (contents: string, position: Pos): string => {
    return contents.slice(position.start.offset, position.end.offset);
}

export const replaceTextAtPosition = (contents: string, newContents: string, position: Pos): string => {
    const first = contents.slice(0, position.start.offset);
    const second = contents.slice(position.end.offset);
    return first + newContents + second;
}

export const diffTaskHierarchies = (prev: TaskHierarchy, curr: TaskHierarchy): string[] => {
    // const [removedIds] = compareArrays(prev.map(i => i.id), curr.map(i => i.id));
    // const [, newNames] = compareArrays(prev.map(i => i.name), curr.map(i => i.name));
    return curr.reduce((ups, chi, currI) => {
        const prevI = prev.findIndex(phi => phi.name === chi.name && phi.id === chi.id);
        // if task found in previous hierarchy and is same
        if (prevI > -1 && prev[prevI].parentId === chi.parentId && prev[prevI].complete === chi.complete)
            return ups;
        return [...ups, chi.id];
    }, [] as string[]);
};

export const getTaskCacheUpdates = (prev: FileTaskCache, curr: FileTaskCache) => {
    const currCopy = {...curr};
    const updateIds = new Set<string>();
    const [deleteIds] = compareArrays(Object.values(prev).map(i => i.id), Object.values(curr).map(i => i.id));
    const [, newTasks] = compareArrays(Object.values(prev).map(i => i.name), Object.values(curr).map(i => i.name));
    for (const prevLine in prev) {
        const prevItem = prev[prevLine];
        if (prevLine in currCopy) {
            const currItem = currCopy[prevLine];
            if (currItem.name !== prevItem.name || currItem.id !== prevItem.id)
                updateIds.add(prevItem.id)
            delete currCopy[prevLine];
        }
        else {
            if (!(prevItem.id in deleteIds))
                updateIds.add(prevItem.id);
        }
    }
    for(const updateId of diffTaskHierarchies(hierarchyFromTaskCache(prev), hierarchyFromTaskCache(curr)))
        updateIds.add(updateId);
    return {
        updateIds,
        deleteIds: new Set(deleteIds),
        newTasks: new Set(newTasks)
    };
};