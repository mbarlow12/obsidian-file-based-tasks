import {BaseTask, Task, TaskStatus} from "./Task";

export interface TaskLine extends Array<number|BaseTask> {
    0: number,
    1: BaseTask,
    length: 2
}

export default class TaskParser {
    // pattern = -/* [x] [something]
    static strictPattern: RegExp = /(?:-|\*) \[(?<complete>\s|x)?\]\s+(?<taskLine>\S.*)/;
    static generalPattern: RegExp = /(?:-|\*)\s*\[(?<complete>[\sxX]*)\]\s*(?<taskLine>\S.*)/;

    static parseLine(line: string): BaseTask | null {
        const match = line.match(TaskParser.strictPattern);
        if (match) {
            const {complete, taskLine} = match.groups;
            return {
                status: complete === 'x' ? TaskStatus.DONE : TaskStatus.TODO,
                name: taskLine
            }
        } else
            return null;
    }

    static parseLines(contents: string): Array<TaskLine> {
        const lines = contents.split(/\r?\n/g);
        return lines.map((line, index) => {
           return [index, TaskParser.parseLine(line)] as TaskLine
        }).filter(tl => tl[1] !== null);
    }
}