import {ITask, FileTaskLine, DisplayTask, BaseTask} from "../Task/types";
import {emptyTask} from "../Task";
import {CachedMetadata, TFile} from "obsidian";

// pattern = -/* [x] [something]
const strictPattern = /^\s*(?:-|\*) \[(?<complete>\s|x)?\]\s+(?<taskLine>(\d|\w)[^\^]*)(?: \^(?<id>[0-9A-Za-z]+))?$/;

export default class TaskParser {

    static parseLine(line: string): BaseTask | null {
        const match = line.match(strictPattern);
        if (match) {
            const {complete, taskLine, id} = match.groups;
            return {
                complete: complete === 'x',
                name: taskLine.trim(),
                id: Number.parseInt(id || '-1')
            };
        }
        else
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
                location: { filePath: filePath, lineNumber: cacheListItem.position.start.line},
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