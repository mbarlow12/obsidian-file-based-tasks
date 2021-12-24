import {Pos, TFile, TFolder} from "obsidian";
import {DisplayTask, ITask, ITaskTree, TaskLocation} from "./Task/types";
import {clone, entries, isEqual, merge} from 'lodash';
import {compareArrays, emptyTask, hashTask, locStr, pos, Task, taskLocationStr} from "./Task";
import {FileTaskCache, TaskCacheItem} from "./File/types";
import {getTaskCacheUpdates} from "./File";

export class TaskIndex {
    private tasks: Record<number, ITask>;
    private locationIndex: Record<string, number>;
    private tasksByName: Record<string, number>;
    private parents: Record<number, Set<number>>;
    private cache: Record<number, string>;
    private nextId: number;

    constructor(tasks: ITask[] = []) {
        this.tasks = {};
        this.locationIndex = {};
        this.parents = {};
        this.cache = {};
        let nextId = tasks.reduce((id, currTask) => {
            return Math.max(id, currTask.id);
        }, 0) + 1;
        nextId = nextId ?? Date.now();
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            if (!task.id)
                task.id = nextId++;
            this.tasks[task.id] = task;
            this.tasksByName[task.name] = task.id;
            for (const location of task.locations) {
                this.locationIndex[taskLocationStr(location)] = task.id;
            }
            hashTask(task).then(hash => {
                this.cache[task.id] = hash;
            });
        }
        this.nextId = nextId;
    }

    public async updateIndex() {
        const newCacheArr = await Promise.all(entries(this.tasks).map(async ([id, task]) => (Promise.all([Number.parseInt(id), hashTask(task)]))));
        const newCache: Record<number, string> = newCacheArr.reduce((c, [id, taskHash]) => {
            c[id] = taskHash;
            return c;
        }, {} as Record<number, string>);
        const [deletedIds, newIds] = compareArrays(Object.keys(this.cache), Object.keys(newCache));
        const updatedIds: number[] = [];
        for (const newId in newCache) {
            if (newId in this.cache && this.cache[newId] !== newCache[newId])
                updatedIds.push(Number.parseInt(newId));
        }
        this.updateLocationIndex();
        this.updateParentIndex();
        this.updateTasksByName();
        this.cache = newCache;
        return {newIds, updatedIds, deletedIds};
    }

    private updateLocationIndex() {
        const newLocations: Record<string, number> = Object.values(this.tasks).reduce((locs, task) => {
            for (const tLoc of task.locations) {
                locs[taskLocationStr(tLoc)] = task.id;
            }
            return locs;
        }, {} as Record<string, number>);
        this.locationIndex = newLocations;
    }

    private updateParentIndex() {
        const newParents: Record<number, Set<number>> = {};
        for (const task of Object.values(this.tasks)) {
            if (task.children.length === 0)
                continue;
            for (const childId of task.children) {
                if (!(childId in newParents))
                    newParents[childId] = new Set();
                newParents[childId].add(task.id);
            }
        }
        this.parents = newParents;
    }

    private updateTasksByName() {
        const byName: Record<string, number> = Object.values(this.tasks).reduce((record, task) => {
           record[task.name] = task.id;
           return record;
        }, {} as Record<string, number>);
        this.tasksByName = byName;
    }

    search(needle: string) {

    }

    public createTask(name: string, locations: TaskLocation[], children?: number[], description?: string): ITask {
        const id = this.nextId++;
        const task = {
            ...emptyTask(),
            id,
            name,
            locations: locations,
        };
        this.tasks[id] = task;
        return this.tasks[id];
    }

    toggleCompletion(name: string | number) {
        if (this.taskExists(name)) {
            let task: ITask;
            if (typeof name === 'string') {
                task = this.getTaskByName(name);
            } else {
                task = this.getTaskById(name);
            }
            task.complete = !task.complete;
            this.updateTask(task);
        }
    }

    private deduplicate() {
        // ensure all parents and children simply point to objects in the index
    }

    public addTask(t: ITask) {
        if (this.taskExists(t.name)) {
            // TODO: consider erroring or changing the name?
            return;
        }

        t.id = this.nextId++;

        this.tasks[t.id] = {
            ...emptyTask(),
            ...t
        };

        return this.tasks[t.id];
    }

    public addTasks(tasks: ITask[]) {
        return tasks.map(this.addTask);
    }

    taskExists(name: string | number) {
        if (typeof name === 'number') {
            return this.tasks.hasOwnProperty(name);
        } else
            return this.tasksByName.hasOwnProperty(name);
    }

    deleteLocations(taskId: number, locs: TaskLocation[]) {
        for (let i = 0; i < locs.length; i++) {
            delete this.locationIndex[taskLocationStr(locs[i])];
        }
    }

    /**
     * Get all tasks in the index that hold references to the provided task name in either
     * their parents or children member arrays.
     *
     * @param targetId
     * @return Array<ITask>
     */
    getRefHolders(targetId: number) {
        const ret: ITask[] = [];
        for (const tid in this.tasks) {
            const task = this.tasks[tid];
            if (task.children.filter(c => c === targetId).length) {
                // targetId is in this task's children
                ret.push(task);
            }
        }
        return ret;
    }

    deleteTask(t: ITask | string | number) {
        let id: number = typeof t === 'string' ? this.tasksByName[t] : typeof t === 'number' ? t : t.id;
        if (!this.taskExists(id))
            return;

        const deleted = this.tasks[id];
        delete this.tasks[id];
        return deleted;
    }

    clear() {
        this.tasks = {};
        this.cache = {};
        this.locationIndex = {};
        this.parents = {};
        this.nextId = 0;
    }

    updateTask(t: ITask) {
        if (!t.id || t.id === -1 || !this.taskExists(t.id)) {
            if (this.taskExists(t.name))
                throw new Error(`Task (${t.name}) exists but improper id: ${t.id}`);
            this.addTask(t);
            return this.tasks[t.id];
        } else {
            t.updated = Date.now();
            t.created = t.created ?? Date.now();
            this.tasks[t.id] = {...t};
            return this.tasks[t.id];
        }
    }

    public getTaskById(id: number): ITask {
        return {...this.tasks[id]};
    }

    public getTaskByName(name: string): ITask | null {
        return {...this.tasks[this.tasksByName[name]]} || null;
    }

    public getTasksByFilepath(filepath: string): ITask[] {
        return Object.keys(this.locationIndex)
            .filter(k => k.split(':')[0] === filepath)
            .map(k => ({...this.tasks[this.locationIndex[k]]}));
    }

    public getTaskCacheForFile(filepath: string): FileTaskCache {
        const tasks = this.getTasksByFilepath(filepath);
        return tasks.reduce((cache, task) => {
            return {
                ...cache,
                ...this.taskToCache(task, filepath)
            }
        }, {});
    }

    public taskToCache(task: ITask, filepath: string): FileTaskCache {
        const {name, id, complete} = task;
        const positions = this.getFilePositions(task, filepath);
        return positions.reduce((cache, position) => {
            const ret: TaskCacheItem = {
                id: `${id}`,
                name,
                complete,
                position,
                parent: -1
            };
            const parent = this.getFileParent(task, filepath) || emptyTask();
            const parentPositions = this.getFilePositions(parent, filepath);
            if (parentPositions.length > 0) {
                let parentPos: Pos = parentPositions[0];
                if (parentPositions.length > 1) {
                    for (const pPos of parentPositions) {
                        if (pPos.start.line > parentPos.start.line && pPos.start.line < position.start.line)
                            parentPos = pPos;
                    }
                }
                ret.parent = parentPos.start.line;
                ret.parentId = parent.id;
            }
            return {
                ...cache,
                [position.start.line]: ret
            };
        }, {} as FileTaskCache);
    }

    public getFileParent({id}: ITask, filepath: string): ITask {
        if (id in this.parents) {
            for (const parent of this.parents[id]) {
                const parentTask = this.getTaskById(parent);
                const found = parentTask.locations.find(loc => loc.filePath === filepath);
                if (found)
                    return parentTask;
            }
        }
        return null;
    }

    public getFilePositions({locations}: ITask, filepath: string): Pos[] {
        return locations.filter(loc => loc.filePath === filepath).map(loc => loc.position);
    }

    private mergeLocations(locList1: TaskLocation[], locList2: TaskLocation[]): TaskLocation[] {
        const newLocs = locList2.filter(loc => !locList1.includes(loc));
        return [...locList1, ...newLocs];
    }

    private mergeTaskList(list1: ITask[], list2: ITask[]): ITask[] {
        const ids = new Set(list1.map(t => t.id));
        const ret = [...list1];
        for (const task of list2) {
            if (!ids.has(task.id)) {
                ids.add(task.id);
                ret.push(task);
            }
        }
        return ret;
    }

    public toTaskList(): ITask[] {
        return Object.values(this.tasks).sort((a, b) => a.name.localeCompare(b.name));
    }

    public empty() {
        return Object.values(this.tasks).length > 0;
    }

    public handleNewTasksFromFile(file: TFile, taskNames: string[], cache: FileTaskCache) {
        const newTasks: Record<number, ITask> = {};
        for (const line in cache) {
            const item = cache[line];
            if (item.name in taskNames) {
                let task: ITask;
                // it's a new task
                if (!this.taskExists(item.name)) {
                    task = this.createTask(item.name, [{filePath: file.path, position: item.position}]);
                }
                else {
                    // task already exists, add this location
                }
            }
        }
    }

    public handleFileCacheUpdate(file: TFile, prev: FileTaskCache, current: FileTaskCache) {
        const {updateIds, deleteIds, newTasks} = getTaskCacheUpdates(prev, current);
        // delete all locations in this file
        this.getTasksByFilepath(file.path).map(t => {
           const newLocs = [...t.locations.filter(l => l.filePath !== file.path)];
           t.locations = newLocs;
           this.tasks[t.id] = t;
        });
        for (const currLineNum in current) {
            let task: ITask;
            const currItem = current[currLineNum];
            const currLocation: TaskLocation = {filePath: file.path, position: currItem.position};
            if (currItem.name in newTasks) {
                if (!this.taskExists(currItem.name)) {
                   task = this.createTask(currItem.name, [currLocation]);
                }
                else {
                    task = this.getTaskByName(currItem.name);
                    if (!currItem.id || (Number.parseInt(currItem.id) === task.id))
                        throw new Error(`ID mismatch for ${currItem.name}. Index: ${task.id}, Cache ${currItem.id}`)
                    task.locations.push(currLocation);
                    this.updateTask(task);
                }
            }
            else if (currItem.id in deleteIds) {
                this.deleteTask(currItem.id);
            }
            else if (currItem.id in updateIds) {
                if (!this.taskExists(Number.parseInt(currItem.id)))
                    throw new Error(`ID ${currItem.id} does not exist from task ${currItem.name}`);

                task = this.getTaskById(Number.parseInt(currItem.id));
                task.complete = currItem.complete;
                task.locations.push(currLocation)
                task.updated = Date.now();
                this.updateTask(task);
            }

            if (task && currItem.parentId > -1) {
                const parent = this.getTaskById(currItem.parentId);
                if (!parent.children.includes(task.id)) {
                    parent.children.push(task.id);
                    this.updateTask(parent);
                }
            }
        }
        return this.updateIndex();
    }

    public deleteFromFile(path: string) {

    }

    public triggerIndexUpdateEvent(dirtyTaskIds: number[]) {

    }

    private taskTreeFromId(id: number): ITaskTree {
        if (!this.taskExists(id))
            return null;
        const task = this.getTaskById(id);
        return {
            ...task,
            children: (task.children || []).map(this.taskTreeFromId)
        };
    }
}