import {TFolder} from "obsidian";
import {ITask, TaskLocation, TaskStatus} from "./Task/types";
import {clone, isEqual} from 'lodash';
import {Task} from "./Task";

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

const locStr = (l: TaskLocation): string => `${l.filePath}:${l.line}`;

const dataStr = (data: unknown): string =>`${frontDelim}${data}${rearDelim}`;

const requiredKeys: Array<keyof ITask> = ['status','name', 'locations', 'created', 'updated']

export class TaskIndex {
    private tasks: Record<string, ITask>
    private locations: Record<string, ITask>

    constructor(tasks: ITask[] = []) {
        this.tasks = {};
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            this.tasks[task.name] = task;
            for (const location of task.locations) {
                this.locations[locStr(location)] = this.tasks[task.name];
            }
        }
    }

    public static taskID(name: string, taskDir: TFolder) {
        return `${taskDir.path}/${name}.md`;
    }

    search(needle: string) {

    }

    createTask(name: string, location: TaskLocation): ITask {
        this.tasks[name] = new Task(name, TaskStatus.TODO, [location]);
        this.locations[locStr(location)] = this.tasks[name];
        this.deduplicate();
        return this.tasks[name];
    }

    completeTask(name: string) {
        if (this.taskExists(name)) {
            const task = this.getTaskByName(name);
            task.status = TaskStatus.DONE;
            this.updateTask(task);
        }
    }

    private deduplicate() {
        // ensure all parents and children simply point to objects in the index
        for (const name in this.tasks) {
            let task = this.tasks[name];
            const newChildren = task.children?.map(c => this.getTaskByName(c.name)) || [];
            const newParents = task.parents?.map(p => this.getTaskByName(p.name)) || [];
            task.children = newChildren;
            task.parents = newParents;
            this.tasks[name] = task;
        }
    }

    addTask(t: ITask) {
        if (this.taskExists(t.name)) {
            // TODO: consider erroring or changing the name?
            return;
        }
        if (t instanceof Task) {
            this.tasks[t.name] = t;
        }
        else {
            this.tasks[t.name] = Task.fromITask(t);
        }
        for (const location of this.tasks[t.name].locations || []) {
            this.locations[locStr(location)] = this.tasks[t.name];
        }
        this.deduplicate();
    }

    addTasks(tasks: ITask[]) {
        for (let i = 0; i < tasks.length; i++) {
            this.addTask(tasks[i]);
        }
    }

    taskExists(name: string) {
        return Object.keys(this.tasks).includes(name);
    }

    deleteLocations(locs: TaskLocation[]) {
        for (let i = 0; i < locs.length; i++) {
            delete this.locations[locStr(locs[i])];
        }
    }

    deleteTask(t: ITask|string) {
        let name = '';
        if (typeof t === 'string') {
            name = t;
            if (this.taskExists(t)) {
                this.deleteLocations(this.tasks[t].locations);
                delete this.tasks[t]
            }
        }
        else {
            name = t.name;
            this.deleteLocations(this.tasks[t.name].locations);
            delete this.tasks[t.name];
        }
        const modified = [];
        // remove parent and child refs
        for (const task of Object.values(this.tasks)) {
            const [newC, newP] = [task.children, task.parents].map(arr => {
                let iFound = arr.findIndex((t) => t.name === name);
                if (iFound >= 0) {
                    modified.push(task.name);
                    arr.splice(iFound, 1)
                }
                return arr;
            });
            task.children = newC;
            task.parents = newP;
        }
        // todo: trigger file update
    }

    clear() {
        this.tasks = {};
        this.locations = {};
    }

    updateTask(t: ITask) {
        if (!this.taskExists(t.name)) {
            this.addTask(t);
            return this.tasks[t.name];
        }
        else {
            const existing = clone(this.tasks[t.name]);
            const  newTask = {
                ...existing,
                ...t
            };
            this.tasks[t.name] = newTask;
            for (let loc in this.locations || []) {
                if (this.locations[loc].name === t.name) {
                    delete this.locations[loc]
                }
            }
            for (const location of this.tasks[t.name].locations || []) {
                this.locations[locStr(location)] = this.tasks[t.name];
            }
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

    getTasksByFilename(name: string): ITask[] {
        return Object.keys(this.locations)
            .filter(k => k.split(':')[0] === name)
            .map(k => this.locations[k]);
    }

    private mergeLocations(locList1: TaskLocation[], locList2: TaskLocation[]): TaskLocation[] {
        const newLocs = locList2.filter(loc => !locList1.includes(loc));
        return [...locList1, ...newLocs];
    }

    private mergeTaskList(list1: ITask[], list2: ITask[]): ITask[] {
        const names = new Set(list1.map(t => t.name));
        const ret = [...list1];
        for (const task of list2) {
            if (!names.has(task.name)) {
                names.add(task.name);
                ret.push(task);
            }
        }
        return ret;
    }

    /**
     * look at name, status, description, children, parents, and locations
     * todo: add filepath to the arguments
     *   - we always trigger the update from a single file
     *   - iterate through the tasks
     *      - if name doesn't exist, add to index
     *      - else, check if new task is different
     *          - could be different description, parents/children, status, locations
     *          - locations: mod/add (is filepath in existing locations?), delete (is an existing task in the file, but not in the new
     *            tasks)
     *
     * @param taskRecord
     */
    handleIndexUpdateRequest(filePath: string, taskRecord: Record<number, ITask>) {
        const createTasks: Task[] = [];
        const modifyTasks: Task[] = [];
        const newIndex = new TaskIndex();
        const existingFileTasks = this.getTasksByFilename(filePath);

        for (let key of Object.keys(taskRecord)) {
            const t = taskRecord[Number(key)];
            const task = Task.isTask(t) ? t : Task.fromITask(t);
            if (!this.getTaskByName(task.name)) {
                createTasks.push(task);
            }
            else {
                const existing = this.getTaskByName(task.name) as Task;
                let diffLocations = false;
                for (const loc of task.locations) {
                    // new location - additional line num
                    // deleted location - get all tasks from file name,
                }
                    if (
                        existing.status !== task.status ||
                        existing.description !== task.description ||
                        existing.compareChildren(task).length ||
                        existing.compareParents(task).length
                    )
                        modifyTasks.push(task);

                    // description
                    // children
                    // parents
                    // locations
            }
        }

        for (let ct of createTasks) {
            this.addTask(ct);
        }

        for (let mt of modifyTasks) {

        }

        // for (let i = 0; i < taskRecord.length; i++) {
        //     const newTask = Task.fromITask(taskRecord[i]);
        //     if (newIndex.taskExists(newTask.name)) {
        //         const t = newIndex.getTaskByName(newTask.name);
        //         t.status = newTask.status;
        //         t.locations = this.mergeLocations(t.locations, newTask.locations);
        //         t.parents = this.mergeTaskList(t.parents, newTask.parents);
        //         t.children = this.mergeTaskList(t.children, newTask.children);
        //         t.description = (t.description || '') + (newTask.description || '');
        //         if (newTask.created < t.created) {
        //             t.created = newTask.created;
        //         }
        //         if (newTask.updated > t.updated) {
        //             t.updated = newTask.updated;
        //         }
        //     }
        //     else {
        //
        //     }
        // }
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