import {ITask, FileTaskLine, DisplayTask} from "../Task/types";
import {emptyTask} from "../Task";
import {CachedMetadata, TFile} from "obsidian";

const strictPattern: RegExp = /^\s*(?:-|\*) \[(?<complete>\s|x)?\]\s+(?<taskLine>\S[^\^]*)(?: \^(?<id>[0-9A-Za-z]+))?$/gm;

export default class TaskParser {
    // pattern = -/* [x] [something]
    static strictPattern: RegExp = /(?:-|\*) \[(?<complete>\s|x)?\]\s+(?<taskLine>\S[^\^]*)\^?.*$/;
    static generalPattern: RegExp = /(?:-|\*)\s*\[(?<complete>[\sxX]*)\]\s*(?<taskLine>\S.*)/;
    // todo: add complete/incomplete status when handling block id
    //  - even anonymous tasks should always have a blockID for linking
    static blockID: RegExp = / \^([A-Z][a-z][0-9]+)$/;

    static parseLine(line: string): ITask | null {
        const match = line.match(TaskParser.strictPattern);
        if (match) {
            const {complete, taskLine} = match.groups;
            return {
                ...emptyTask(),
                complete: complete === 'x',
                name: taskLine.trim(),
            };
        } else
            return null;
    }

    static parseLines(contents: string): Array<FileTaskLine> {
        const lines = contents.split(/\r?\n/g);
        return lines.map((line, index) => {
            return [index, TaskParser.parseLine(line)] as FileTaskLine
        }).filter(tl => tl[1] !== null);
    }

    // static parseLinesToRecord(filePath: string, contents: string): Record<number, ITask> {
    //     const lines = contents.split(/\r?\n/g);
    //     return lines.reduce((rec, line, lineNum) => {
    //         const task = TaskParser.parseLine(line);
    //         if (task) {
    //             task.locations = [{filePath, position: lineNum}]
    //             rec[lineNum] = task;
    //         }
    //         return rec;
    //     }, {} as Record<number, ITask>);
    // }
}


export const parseFileContents = (filePath: string, contents: string, fileCache: CachedMetadata): Array<[number, DisplayTask]> => {
    const cacheTasks = fileCache.listItems.filter(li => li.task);
    const ret: Array<[number, DisplayTask]> = [];
    for (let i = 0; i < cacheTasks.length; i++) {
        const cacheListItem = cacheTasks[i];
        const {start: {line: lineNum, offset: sOff}, end: {offset: eOff}} = cacheListItem.position;
        const line = contents.slice(sOff, eOff);
        const match = line.match(strictPattern);
        if (match) {
            const {complete, taskLine, id} = match.groups;
            const task: DisplayTask = {
                complete: complete === 'x',
                name: taskLine.trim(),
                location: { filePath: filePath, position: cacheListItem.position},
            };
            if (id)
                task.id = Number.parseInt(id);
            if (cacheListItem.parent > -1) {
                task.parent = ret.find(([elemLine]) => elemLine === cacheListItem.parent)[1];
            }
            ret.push([lineNum, task]);
        }
    }
    return ret;
};