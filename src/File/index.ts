import {CachedMetadata, TFile} from "obsidian";
import {FileTaskCache, FileTaskRecord} from "./types";
import {parseTaskString} from "../Parser";
import {Task, taskLocationStr} from "../Task";
import {hash} from "../util/hash";
import {State} from "../Store/TaskStore";

export const getFileTaskState = (file: TFile, cache: CachedMetadata, contents: string): State => {
    const contentLines = contents.split(/\r?\n/);
    return (cache.listItems || []).filter(li => li.task !== undefined).reduce((st, cli) => {
        const lineNumber = cli.position.start.line;
        const locStr = taskLocationStr({filePath: file.path, lineNumber, parent: cli.parent, pos: cli.position})
        return {
            ...st,
            [locStr]: {
                ...cli,
                ...parseTaskString(contentLines[lineNumber])
            }
        }
    }, {} as State)
};

export const hashTaskCache = async (cache: FileTaskCache): Promise<string> => {
    const sortedItems = Object.entries(cache).sort(([a], [b]) => a - b);
    const msg = JSON.stringify(sortedItems);
    return await hash(msg);
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