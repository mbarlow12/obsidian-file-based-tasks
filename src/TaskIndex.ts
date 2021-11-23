import {TFolder} from "obsidian";
import {ITask, TaskLocation, TaskStatus} from "./Task/types";
import {clone, isEqual, merge} from 'lodash';
import {Task} from "./Task";
import {off} from "codemirror";

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

const locStr = (name: string, l: TaskLocation): string => `${l.filePath}:${l.line}:${name}`;

const dataStr = (data: unknown): string =>`${frontDelim}${data}${rearDelim}`;

const requiredKeys: Array<keyof ITask> = ['status','name', 'locations', 'created', 'updated']

export class TaskIndex {
    private tasks: Record<string, ITask>
    private locationIndex: Record<string, ITask>

    constructor(tasks: ITask[] = []) {
        this.tasks = {};
        this.locationIndex = {};
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            this.tasks[task.name] = task;
            for (const location of task.locations) {
                this.locationIndex[locStr(task.name, location)] = this.tasks[task.name];
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
        this.locationIndex[locStr(name, location)] = this.tasks[name];
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

        t.created = new Date();
        t.updated = new Date();

        if (t instanceof Task) {
            this.tasks[t.name] = t;
        }
        else {
            this.tasks[t.name] = Task.fromITask(t);
        }

        this.tasks[t.name].children = [];
        this.tasks[t.name].parents = [];

        for (const child of t.children) {
            if (!this.taskExists(child.name))
                this.addTask(child);
            this.tasks[t.name].children.push(child);
        }
        for (const parent of t.parents) {
            if (!this.taskExists(parent.name))
                this.addTask(parent);
            this.tasks[t.name].parents.push(parent);
        }

        for (const location of this.tasks[t.name].locations || []) {
            this.locationIndex[locStr(t.name, location)] = this.tasks[t.name];
        }
    }

    addTasks(tasks: ITask[]) {
        for (let i = 0; i < tasks.length; i++) {
            this.addTask(tasks[i]);
        }
        this.deduplicate();
    }

    taskExists(name: string) {
        return Object.keys(this.tasks).includes(name);
    }

    deleteLocations(taskName: string, locs: TaskLocation[]) {
        for (let i = 0; i < locs.length; i++) {
            delete this.locationIndex[locStr(taskName, locs[i])];
        }
    }

    deleteRefs(taskName: string) {
        for (const task of Object.values(this.tasks)) {
            const childIndex = task.children.findIndex(c => c.name === taskName);
            if (childIndex > -1)
                task.children.splice(childIndex, 1);
            const pIndex = task.parents.findIndex(p => p.name === taskName);
            if (pIndex > -1)
                task.parents.splice(pIndex, 1)
        }
    }

    /**
     * Get all tasks in the index that hold references to the provided task name in either
     * their parents or children member arrays.
     *
     * @param taskName
     * @return Array<ITask>
     */
    getRefHolders(taskName: string) {
        const ret: ITask[] = [];
        for (const taskName in this.tasks) {
            const task = this.tasks[taskName];
            if (
                task.children.filter(c => c.name === taskName).length ||
                task.parents.filter(p => p.name === taskName).length
            ) {
                // taskName is in this task's parents/children
                ret.push(task);
            }
        }
        return ret;
    }

    deleteTask(t: ITask|string): ITask[] {
        let name = typeof t === 'string' ? t : t.name || '';
        if (!this.taskExists(name))
            return [];

        const deleted = this.tasks[name];
        this.deleteLocations(name, this.tasks[name].locations);
        delete this.tasks[name];
        const modified: Set<string> = new Set();
        // remove parent and child refs
        for (const task of Object.values(this.tasks)) {
            const [newC, newP] = [task.children, task.parents].map(arr => {
                let iFound = arr.findIndex((t) => t.name === name);
                if (iFound >= 0) {
                    modified.add(task.name);
                    arr.splice(iFound, 1)
                }
                return arr;
            });
            task.children = newC;
            task.parents = newP;
        }
        return [deleted, ...Array.from(modified).map(this.getTaskByName)];
    }

    clear() {
        this.tasks = {};
        this.locationIndex = {};
    }

    updateTask(t: ITask) {
        if (!this.taskExists(t.name)) {
            this.addTask(t);
            return this.tasks[t.name];
        }
        else {
            const existing = clone(this.tasks[t.name]);
            const newTask = merge(existing, t);
            newTask.updated = new Date();
            newTask.created = newTask.created ?? new Date();
            this.tasks[t.name] = newTask;
            // update locationIndex
            for (let loc in this.locationIndex || []) {
                if (this.locationIndex[loc].name === t.name) {
                    delete this.locationIndex[loc]
                }
            }
            for (const location of this.tasks[t.name].locations || []) {
                this.locationIndex[locStr(t.name, location)] = this.tasks[t.name];
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

    getTasksByFilename(name: string): TaskIndex {
        const tasks: ITask[] = Object.keys(this.locationIndex)
            .filter(k => k.split(':')[0] === name)
            .map(k => this.locationIndex[k]);
        return new TaskIndex(tasks);
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

    public toTaskList(): ITask[] {
        return Object.values(this.tasks).sort((a,b) => a.name.localeCompare(b.name));
    }

    /**
     * look at name, status, description, children, parents, and locationIndex
     * todo: add filepath to the arguments
     *   - we always trigger the update from a single file
     *   - iterate through the tasks
     *      - if name doesn't exist, add to index
     *      - else, check if new task is different
     *          - could be different description, parents/children, status, locationIndex
     *          - locationIndex: mod/add (is filepath in existing locationIndex?), delete (is an existing task in the file, but not in the new
     *            tasks)
     *
     * @param taskRecord
     */
    handleIndexUpdateRequest(filePath: string, taskRecord: Record<number, ITask>) {
        const modifyIndex = new TaskIndex();
        const deleted: ITask[] = [];
        const existingFileTaskIndex = this.getTasksByFilename(filePath);

        if (Object.entries(taskRecord).length === 1 && -1 in taskRecord) {
            // file is a task file
            const task = taskRecord[-1] as Task;
            this.updateTask(task);
        }
        else {
            for (const ln in taskRecord) {
                const line = Number(ln);
                const fileTask = taskRecord[line];
                const searchKey = locStr(fileTask.name, {filePath, line});
                if (searchKey in this.locationIndex) {
                    // the location is the same
                    const existingTask = this.locationIndex[searchKey] as Task;
                    // check parents and children
                    let [existingNames, newNames] = existingTask.compareChildren(fileTask);
                    if (existingNames.length) {
                        // existing task has children that the new task does not
                        // could be just be a result of not displaying it
                    }
                    if (existingNames.length || newNames.length) {
                        // different children

                        modifyIndex.addTask(fileTask)
                    }
                    [existingNames, newNames] = existingTask.compareParents(fileTask);
                    if (existingNames.length || newNames.length) {
                        modifyIndex.addTask(fileTask);
                    }
                }
                else {
                    // this location does not exist, queue this task for update
                    // handles line changes via other insertions/deletions
                    modifyIndex.addTask(fileTask);
                }
                // remove from existing file tasks
                existingFileTaskIndex.deleteTask(fileTask);
            }
            /**
             * the existing file tasks represent all the tasks that had a location in this file
             * each task pulled from the latest file update is removed from the existing index
             * if there are any tasks left over, that means they were formerly in the file and now arent
             *   - this file's location needs to be removed from each task
             *   - if this file was the only location for the task, delete the task
             */
            if (!existingFileTaskIndex.empty()) {
                // there were task lines in the file that were deleted
                for (const taskName in existingFileTaskIndex) {
                    // get locations for this task not in this file
                    // implies that the backlog is the last place to delete tasks
                    const otherFileLocations = this.tasks[taskName].locations
                        .filter(loc => loc.filePath !== filePath);
                    if (otherFileLocations.length === 0) {
                        deleted.push(this.getTaskByName(taskName));
                    }
                }
            }
        }
        this.updateIndex(modifyIndex, deleted);
    }

    public updateIndex(toModify: TaskIndex, toDelete: ITask[]) {
        const newTasks: Record<string, ITask> = {};
        for (const deletedTask of toDelete) {
            const [deleted, ...refHolders] = this.deleteTask(deletedTask)
            refHolders.forEach(toModify.addTask);
        }

        for (const existingTaskName in this.tasks) {
            if (toModify.taskExists(existingTaskName)) {
                const existing = this.tasks[existingTaskName];
                const modified = toModify.getTaskByName(existingTaskName);
                const status = modified.status;
                const created = existing.created;
                const updated = new Date();
                const description = modified.description;
            }
        }
    }

    public empty() {
        return Object.values(this.tasks).length > 0;
    }
}