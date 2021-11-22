import {CachedMetadata, TFile} from "obsidian";
import {FileTaskTreeNode} from "./types";
import TaskParser from "../TaskParser";
import {IAnonymousTask, ITask} from "../Task";
import {clone} from "lodash";

export const getFileTaskTree = (fileContents: string, tabSize: number = 4): FileTaskTreeNode[] => {
    const lines = fileContents.split('\n');
    const rec: Record<string, IAnonymousTask> = {};
    const taskData: {line: number, indent: number, task: IAnonymousTask}[] = [];
    for (const [lineNum, line] of lines.entries()) {
        const task = TaskParser.parseLine(line);
        if (task) {
            const indent = line.match(/^(?<indent>\s*)/).groups?.indent.length;
            taskData.push({line: lineNum, indent: Number(indent || 0), task});
        }
    }

    for (const [i, {line, indent, task}] of Object.entries(taskData)) {
        if (indent === 0) {
            rec[task.name] == task;
        }
        else if (indent > 0) {
            let searchIndent = indent;
            let parentI = i;
            while (searchIndent === indent) {
                searchIndent = taskData[--parentI].indent
            }

        }
    }
    return [];
};

export const getTaskTreeFromCache = (cache: CachedMetadata, fileContents: string) => {
    const tasksRecord =  fileContents.split(/\r?\n/g)
        .reduce((rec, line, lineNum) => {
        const task = TaskParser.parseLine(line);
        if (task) {
            rec[lineNum] = task;
        }
        return rec;
    }, {} as Record<number, IAnonymousTask>);

    const tree: Record<string, FileTaskTreeNode> = {};
    // add parent/child relationships if they exist
    for (const cacheListItem of cache.listItems) {
        // skip list items that are not tasks
        if (!cacheListItem.task)
            continue;

        const task = tasksRecord[cacheListItem.position.start.line];
        if (!task) {
            throw new Error(`list item and task mismatch line ${cacheListItem.position.start.line} task ${JSON.stringify(tasksRecord, null, 2)}`);
        }
        if (cacheListItem.parent === -1) {
            if (!(task.name in tree)) {
                tree[task.name] = {task, children: []}
            }
        }
        else if (cacheListItem.parent > -1) {
            // this list item has a parent
            if (cacheListItem.task) {
                // this is a task
                const parentLine = cacheListItem.parent;
                const parent = clone(tasksRecord[parentLine]);
                if (!parent) {
                    // this implies that a subtask is nested under a list item that is not
                    // a task
                    // add this to the tree
                    tree[]
                    continue;
                }
                const currLine = cacheListItem.position.start.line;
                const current = clone(tasksRecord[currLine]);
                // the item is a task and is a sub task
                // add the parent to this task
                current.parents = [...(current.parents || []), parent];
                // add this task to parent
                parent.children = [...(parent.children || []), current];
                tasksRecord[currLine] = current;
                tasksRecord[parentLine] = parent;
            }
        }
    }
    return tasksRecord;
}