import {BaseTask, iTaskStatus, Task, TaskLocation, TaskStatus} from "./Task";
import {TFile, TFolder, Vault} from "obsidian";

/**
 * Like todo.txt
 * - <status> <name>
 */
const frontDelim = "\|\*\~ ";
const rearDelim = " \~\*\|";
const lineKeyPattern = /\[\[(?<key>\w+)\]\](?<data>(?:.|[\n\r])+)/;
const getRegex = (start: string = frontDelim, end: string = rearDelim) => {
    const r = `${start}(.*?(?=${end}))${end}`;
    return new RegExp(r, 'g');
}

const requiredKeys = ['location', 'created', 'updated']

export class TaskIndex {
    private tasks: Record<string, Task>
    private vault: Vault;
    private fileName: string;
    private indexTFile: TFile;

    constructor(vault: Vault, indexFilename: string) {
        this.vault = vault;
        this.tasks = {};
        this.fileName = indexFilename;
        const indexFile = this.getIndexFile();
        vault.cachedRead(indexFile)
            .then(contents => {
                for (const [lineNum, taskLine] of contents.split("\n").entries()) {
                    const task: Task = this.getTaskFromLine(lineNum, taskLine);
                }
            })
    }

    public static taskID(name: string, taskDir: TFolder) {
        return `${taskDir.path}/${name}.md`;
    }

    search(needle: string) {

    }

    addTask(t: Task) {

    }

    addTasks(tasks: Task[]) {}

    deleteTask(t: Task) {

    }

    clear() {}

    updateTask(t: Task) {}

    getTaskById(id: number|string) {}

    public getTaskByName(name: string): Task|null {
        if (name in this.tasks) {
            return this.tasks[name];
        }
        return null;
    }

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

    private getTaskFromLine(lineNum: number, taskLine: string): Task {
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
        return [];
    }

    private parseTimestamps(timestampsString: string): Record<'created'|'updated', Date> {
        const [created, updated] = timestampsString.split(';;;;');
        return {
            created: new Date(created),
            updated: new Date(updated)
        };
    }
}