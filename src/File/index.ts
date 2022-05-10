import {CachedMetadata, Pos, TFile} from "obsidian";
import {FileTaskCache, FileTaskRecord, TaskCacheItem, TaskHierarchy} from "./types";
import TaskParser from "../Parser/TaskParser";
import {compareArrays, emptyTask, ITask, locationsEqual, TaskLocation, taskLocationStr} from "../Task";
import {entries} from "lodash";
import {hash} from "../util/hash";

export const taskCacheItemToDisplayTask = (item: TaskCacheItem) => {
}

export const taskCacheItemToTask = (filePath: string, item: TaskCacheItem): ITask => {
    const {name, id, lineNumber, complete} = item;
    return {
        ...emptyTask(),
        name, id, complete, locations: [{filePath, lineNumber}]
    };
}

export const taskToBaseCacheItem = (location: TaskLocation, task: ITask): TaskCacheItem => {
    const {id, name, complete, locations} = task;
    const loc = locations.find(l => locationsEqual(l, location));
    if (!loc) {
        throw new Error(`Location ${taskLocationStr(location)} not found. Task: ${name}`);
    }
    return {
        id,
        name,
        complete,
        lineNumber: loc.lineNumber,
        parent: -1
    };
}

export const getFileTaskCache = (cache: CachedMetadata, contents: string): FileTaskCache => {
    const items: FileTaskCache = {};
    const contentLines = contents.split(/\r?\n/);
    for (const listItem of (cache.listItems || []).filter(li => li.task)) {
        const line = listItem.position.start.line;
        const taskLine = contentLines[line];
        const task = TaskParser.parseLine(taskLine);
        if (!task) {
            console.warn(`No task found at ${taskLine}.`);
            continue;
        }
        const taskCacheItem: TaskCacheItem = {
            id: Number.parseInt(listItem.id || '-1'),
            name: task.name,
            complete: task.complete,
            parent: listItem.parent,
            lineNumber: listItem.position.start.line,
        };
        if (listItem.parent > -1) {
            taskCacheItem.parentId = items[listItem.parent].id || -1;
            taskCacheItem.parentName = items[listItem.parent].name;
        }
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

export const diffTaskHierarchies = (prev: TaskHierarchy, curr: TaskHierarchy): number[] => {
    // const [removedIds] = compareArrays(prev.map(i => i.id), curr.map(i => i.id));
    // const [, newNames] = compareArrays(prev.map(i => i.name), curr.map(i => i.name));
    return curr.reduce((ups, chi, currI) => {
        const prevI = prev.findIndex(phi => phi.name === chi.name && phi.id === chi.id);
        // if task found in previous hierarchy and is same
        if (prevI > -1 && prev[prevI].parentId === chi.parentId && prev[prevI].complete === chi.complete)
            return ups;
        return [...ups, chi.id];
    }, [] as number[]);
};

export const getNewTasksFromCacheUpdate = (file: TFile, prev: FileTaskCache, curr: FileTaskCache): [string, TaskLocation[]][] => {
    const [, newTasks] = compareArrays(Object.values(prev).map(i => i.name), Object.values(curr).map(i => i.name));
    const ret: Record<string, TaskLocation[]> = {};
    for (const currLine in curr) {
        const currItem = curr[currLine];
        if (currItem.name in newTasks) {
            ret[currItem.name] = [...(ret[currItem.name]||[]), {filePath: file.path, lineNumber: currItem.lineNumber}]
        }
    }
    return entries(ret);
};

export const getDeleteIdsFromCacheUpdate = (prev: FileTaskCache, curr: FileTaskCache) => {
    const currIds = Object.values(curr).map(ci => ci.id);
    const deleteIds: Set<number> = new Set();
    for (const prevLine in prev) {
        const prevItem = prev[prevLine];
        if (prevItem.id !== -1 && !currIds.includes(prevItem.id)) {
            deleteIds.add(prevItem.id);
        }
    }
    return deleteIds;
}

export const fileTaskRecordToCache = (filePath: string, record: FileTaskRecord): FileTaskCache => {
    const cache: FileTaskCache = {};
    const parents: Record<number, number> = {};
    for (const line in record) {
        const lineNumber = Number.parseInt(line);
        const task = record[lineNumber];
        const baseItem = taskToBaseCacheItem({filePath, lineNumber}, task);
        if (task.children?.length > 0) {
            task.children.map(cid => {
               parents[cid] = lineNumber;
            });
        }
        if (task.id in parents) {
            const parentLine = parents[task.id];
            const parent = cache[parentLine];
            baseItem.parent = parentLine;
            baseItem.parentId = parent.id;
            baseItem.parentName = parent.name;
        }
        cache[lineNumber] = baseItem;
    }
    return cache;
}

export const fileTaskCacheToRecord = (filePath: string, cache: FileTaskCache): FileTaskRecord => {
    return Object.keys(cache).reduce((ret, line) => {
        const ln = Number.parseInt(line);
        const cacheItem = cache[ln];
        if (!(ln in ret)) {
            ret[ln] = taskCacheItemToTask(filePath, cacheItem);
        }
        if (cacheItem.parent > -1) {
            if (!ret[cacheItem.parent].children.includes(ln))
                ret[cacheItem.parent].children.push(ln)
        }
        return ret;
    }, {} as Record<number, ITask>);
}

export const validateCaches = (prev: FileTaskCache, curr: FileTaskCache) => {
    const prevLines = Object.keys(prev);
    const currLines = Object.keys(curr);
    if (prevLines.length !== currLines.length) {
        throw new Error(`Caches differ.`)
    }
    for (let i = 0; i < prevLines.length; i++) {
        const prevLine = prevLines[i];
        const currLine = currLines[i];
        if (prevLine !== currLine) {
            throw new Error(`Cache lines differ.`)
        }
    }
}

export const diffFileCaches = (a: FileTaskCache, b: FileTaskCache) => {
  const aNotB: FileTaskCache = {};
  const bNotA: FileTaskCache = {};

  for (const aLine in a) {
      if (!(aLine in b)) {
          aNotB[aLine] = a[aLine];
      }
      else {
          const itemA = a[aLine];
          const itemB = b[aLine];
          for (const prop of Object.getOwnPropertyNames(itemA) as (keyof TaskCacheItem)[]) {
              if (!itemB[prop] || itemA[prop] !== itemB[prop]) {
                  aNotB[aLine] = itemA;
                  bNotA[aLine] = itemB;
                  break;
              }
          }
      }
  }
  for (const bLine in b) {
      if (!(bLine in a))
          bNotA[bLine] = b[bLine];
  }
  return [aNotB, bNotA];
};

export const fileCachesEqual = (a: FileTaskCache, b: FileTaskCache) => {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length)
        return false;
    const [aNotB, bNotA] = diffFileCaches(a, b);
    return !(Object.keys(aNotB).length > 0 || Object.keys(bNotA).length > 0);

}