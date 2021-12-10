import {ITask, FileTaskLine} from "./Task/types";
import {emptyTask} from "./Task";

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
                ...emptyTask,
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

    static parseLinesToRecord(filePath: string, contents: string): Record<number, ITask> {
        const lines = contents.split(/\r?\n/g);
        return lines.reduce((rec, line, lineNum) => {
            const task = TaskParser.parseLine(line);
            if (task) {
                task.locations = [{filePath, line: lineNum}]
                rec[lineNum] = task;
            }
            return rec;
        }, {} as Record<number, ITask>);
    }
}