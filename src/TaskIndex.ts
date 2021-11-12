import {TFile, TFolder, Vault} from "obsidian";
import {ITask, TaskLocation, TaskStatus} from "./Task/types";
import {clone} from 'lodash';

/**
 * Like todo.txt
 * - <status> <name>
 */
const frontDelim = "\|\*\~";
const rearDelim = "\~\*\|";
const lineKeyPattern = /\[\[(?<key>\w+)\]\](?<data>(?:.|[\n\r])+)/;
const getRegex = (start: string = frontDelim, end: string = rearDelim) => {
    const r = `${start}(.*?(?=${end}))${end}`;
    return new RegExp(r, 'g');
}

const dataStr = (data: unknown): string =>`${frontDelim}${data}${rearDelim}`;

const requiredKeys: Array<keyof ITask> = ['status','name', 'locations', 'created', 'updated']

export class TaskIndex {
    private tasks: Record<string, ITask>

    constructor(tasks: ITask[] = []) {
        this.tasks = {};
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            this.tasks[task.name] = task;
        }
    }

    public static taskID(name: string, taskDir: TFolder) {
        return `${taskDir.path}/${name}.md`;
    }

    search(needle: string) {

    }

    addTask(t: ITask) {
        if (this.taskExists(t.name)) {
            // TODO: consider erroring or changing the name?
            return;
        }
        this.tasks[t.name] = t;
    }

    addTasks(tasks: ITask[]) {
        for (let i = 0; i < tasks.length; i++) {
            this.addTask(tasks[i]);
        }
    }

    taskExists(name: string) {
        return Object.keys(this.tasks).includes(name);
    }

    deleteTask(t: ITask) {
        if (this.taskExists(t.name)) {
            delete this.tasks[t.name];
        }
    }

    clear() {
        this.tasks = {};
    }

    updateTask(t: ITask) {
        if (!this.taskExists(t.name)) {
            this.tasks[t.name] = t;
            return t;
        }
        else {
            const existing = clone(this.tasks[t.name]);
            const  newTask = {
                ...existing,
                ...t
            };
            this.tasks[t.name] = newTask;
            return newTask;
        }
    }

    getTaskById(id: number|string) {
        return this.tasks[id];
    }

    public getTaskByName(name: string): ITask|null {
        if (name in this.tasks) {
            return this.tasks[name];
        }
        return null;
    }

    /**
    public getIndexFile(name?: string): TFile {
        if (name)
            return this.vault.getAbstractFileByPath(name) as TFile;

        if (!this.indexTFile) {
            if (!this.fileName)
                throw new Error("No index filename exists!");
            this.indexTFile = this.vault.getAbstractFileByPath(this.fileName) as TFile;
        }
        return this.indexTFile;
    }

    private getTaskFromLine(lineNum: number, taskLine: string): ITask {
        const re = getRegex();
        const [status, name, locationInfo, ...taskMetadatas] = [...taskLine.matchAll(re)].map(m => m[1]);
        const [timestamps] = taskMetadatas.slice(taskMetadatas.length - 1);
        const taskStatus = status === iTaskStatus.DONE ? TaskStatus.DONE : TaskStatus.TODO;
        return {
            id: lineNum,
            name,
            status: taskStatus,
            locations: this.parseLocationData(locationInfo),
            ...this.parseTimestamps(timestamps)
        }
    }

    private parseLocationData(locationInfoString: string): TaskLocation[] {
        return locationInfoString.split('||').map(file_line_num => {
           const [filePath, line_num] = file_line_num.split(':');
           return {
               filePath,
               line: Number.parseInt(line_num)
           };
        });
    }

    private parseTimestamps(timestampsString: string): Record<'created'|'updated', Date> {
        const [created, updated] = timestampsString.split(';;');
        return {
            created: new Date(created),
            updated: new Date(updated)
        };
    }

    private taskToString(task: ITask): string {
        return requiredKeys.map(key => dataStr(task[key])).join('')
    }

    public writeToIndexFile(): Promise<void> {
        const lines = Object.values(this.tasks).sort((a, b) => a.id - b.id);
        return this.vault.modify(this.indexTFile, lines.join('\n'), {mtime: Date.now()});
    }
     */
}