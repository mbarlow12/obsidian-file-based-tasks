import {CachedMetadata, Pos, TFile} from "obsidian";
import {FileTaskCache, FileTaskRecord, TaskCacheItem} from "./types";
import {parseLine} from "../Parser/TaskParser";
import {emptyTask, IndexedTask, locationsEqual, Task, TaskLocation, taskLocationStr} from "../Task";
import {hash} from "../util/hash";

export const taskCacheItemToTask = (filePath: string, item: TaskCacheItem): Task => {
    const {name, tid, lineNumber, complete, parent} = item;
    return {
        ...emptyTask(),
        name, id: tid, complete, locations: [{filePath, lineNumber, cacheItemParent: parent}]
    };
}

export const taskToBaseCacheItem = (location: TaskLocation, task: IndexedTask): TaskCacheItem => {
    const {id, name, complete, locations} = task;
    const loc = locations.find(l => locationsEqual(l, location));
    if (!loc) {
        throw new Error(`Location ${taskLocationStr(location)} not found. Task: ${name}`);
    }
    return {
        tid: id,
        name,
        complete,
        lineNumber: loc.lineNumber,
        parent: -1
    };
}

export const getFileTaskRecord = (file: TFile, cache: CachedMetadata, contents: string): FileTaskRecord => {
    const items: FileTaskRecord = {};
    const contentLines = contents.split(/\r?\n/);
    for (const listItem of (cache.listItems || []).filter(li => li.task)) {
        const line = listItem.position.start.line;
        const taskLine = contentLines[line];
        const task = parseLine(taskLine);
        if (!task) {
            console.warn(`No task found at ${taskLine}.`);
            continue;
        }
        task.locations.push({filePath: file.path, lineNumber: line, cacheItemParent: listItem.parent});
        if (listItem.parent > -1) {
            const parent = cache.listItems.find((th) => th.position.start.line === listItem.parent)
            task.parentLocations = [
              ...(task.parentLocations || []),
                {filePath: file.path, lineNumber: parent.position.start.line, cacheItemParent: parent.parent}
            ]
        }

        items[line] = task;
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

export const fileTaskCacheToRecord = (filePath: string, cache: FileTaskCache): FileTaskRecord => {
    return Object.keys(cache).reduce((ret, line) => {
        const ln = Number.parseInt(line);
        const cacheItem = cache[ln];
        if (!(ln in ret)) {
            ret[ln] = taskCacheItemToTask(filePath, cacheItem);
        }
        const parentLine = cacheItem.parent;
        const ploc: TaskLocation = {
            filePath,
            lineNumber: parentLine,
            cacheItemParent: parentLine > -1 ? cache[parentLine].parent : -1
        }
        ret[ln].parentLocations = [ploc]
        return ret;
    }, {} as Record<number, Task>);
}

export const validateRecords = (fileRecord: FileTaskRecord, indexRecord: FileTaskRecord) => {
    const prevLines = Object.keys(fileRecord);
    const currLines = Object.keys(indexRecord);
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

export const diffFileRecords = (a: FileTaskRecord, b: FileTaskRecord) => {
  const aNotB: FileTaskRecord = {};
  const bNotA: FileTaskRecord = {};

  for (const aLine in a) {
      if (!(aLine in b)) {
          aNotB[aLine] = a[aLine];
      }
      else {
          const itemA = a[aLine];
          const itemB = b[aLine];
          for (const prop of Object.getOwnPropertyNames(itemA) as (keyof Task)[]) {
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

export const fileRecordsEqual = (a: FileTaskRecord, b: FileTaskRecord) => {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length)
        return false;
    const [aNotB, bNotA] = diffFileRecords(a, b);
    return !(Object.keys(aNotB).length > 0 || Object.keys(bNotA).length > 0);

}