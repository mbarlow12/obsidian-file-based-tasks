import {EventRef, MetadataCache, TFile, Vault} from "obsidian";
import {ITask, ITaskTree, TaskLocation} from "./Task/types";
import {entries} from 'lodash';
import {compareArrays, emptyTask, hashTask, locationsEqual, taskLocationStr} from "./Task";
import {FileTaskCache, FileTaskRecord, TaskCacheItem} from "./File/types";
import {TaskEvents} from "./Events/TaskEvents";

export class TaskIndex {
    private tasks: Record<number, ITask>;
    private deletedTasks: Record<number, ITask>;
    private locationIndex: Record<string, number>;
    private tasksByName: Record<string, number>;
    private parents: Record<number, Set<number>>;
    private cache: Record<number, string>;
    private nextId: number;
    private cacheEventRefs: EventRef[];
    private vaultEventRefs: EventRef[];
    private loaded: boolean = false;
    private events: TaskEvents;

    constructor(tasks: ITask[] = [], events: TaskEvents) {
        this.events = events;
        this.tasks = {};
        this.deletedTasks = {};
        this.locationIndex = {};
        this.tasksByName = {};
        this.parents = {};
        this.cache = {};
        let nextId = tasks.length > 0 ? Math.max(...tasks.map(t => t.id || 0)) + 1 : 1;
        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i];
            if (!task.id)
                task.id = nextId++;
            this.tasks[task.id] = task;
            this.updateSupportIndexesFromTask(task);
            hashTask(task).then(hash => {
                this.cache[task.id] = hash;
            });
        }
        this.nextId = nextId;
    }

    public async subscribeToVaultEvents(vault: Vault) {
        const ref = vault.on('create', file => {
            if (file instanceof TFile) {
                if (isTaskFile)
            }
        });
    }

    public async subscribeToCacheEvents(cache: MetadataCache) {}

    public unload() {}

    public broadcastUpdate() {
        this.events.triggerIndexUpdate({index: {...this.tasks}, locations: {...this.locationIndex}});
    }

    public async updateIndex() {
        for (const id in this.tasks) {
            if (this.tasks[id].locations.length === 0) {
                this.deletedTasks[id] = this.tasks[id];
                delete this.tasks[id];
            }
        }
        for (const id in this.tasks) {
            for (let i = 0; i < this.tasks[id].children.length; i++) {
                const childId = this.tasks[id].children[i];
                if (!(childId in this.tasks)) {
                    this.tasks[id].children.remove(childId);
                }
            }
        }
        const newCacheArr = await Promise.all(entries(this.tasks).map(async ([id, task]) => (Promise.all([Number.parseInt(id), hashTask(task)]))));
        const newCache: Record<number, string> = newCacheArr.reduce((c, [id, taskHash]) => {
            c[id] = taskHash;
            return c;
        }, {} as Record<number, string>);
        const [deletedIds, newIds] = compareArrays(Object.keys(this.cache), Object.keys(newCache));
        const [cacheDeleted, deleted] = compareArrays(deletedIds, Object.keys(this.deletedTasks).map(id => `${id}`));
        if (cacheDeleted.length > 0)
            throw new Error(`Deleted IDs from cache not in deletedTasks. ${cacheDeleted.join(',')}`);
        if (deleted.length > 0)
            throw new Error(`Deleted IDs from deletedTasks not reflected in cache. ${deleted.join(',')}`);
        const updatedIds: number[] = [];
        for (const newId in newCache) {
            if (newId in this.cache && this.cache[newId] !== newCache[newId])
                updatedIds.push(Number.parseInt(newId));
        }
        this.updateLocationIndex();
        this.updateParentIndex();
        this.updateTasksByName();
        this.cache = newCache;
        const deletedTasks = {...this.deletedTasks};
        this.deletedTasks = {};
        const dirtyTasks: Record<number, ITask> = [...updatedIds, ...newIds.map(Number.parseInt)].reduce((ret, id) => {
            if (!(id in ret))
                ret[id] = this.getTaskById(id);
            return ret;
        }, {} as Record<number, ITask>);
        return {dirtyTasks, deletedTasks};
    }

    private updateLocationIndex() {
        this.locationIndex = Object.values(this.tasks).reduce((locs, task) => {
            for (const tLoc of task.locations) {
                locs[taskLocationStr(tLoc)] = task.id;
            }
            return locs;
        }, {} as Record<string, number>);
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
        this.tasksByName = Object.values(this.tasks).reduce((record, task) => {
            record[task.name] = task.id;
            return record;
        }, {} as Record<string, number>);
    }

    private updateSupportIndexesFromTask(task: ITask) {
        if (!task.id  || task.id === -1)
            return;
        this.tasksByName[task.name] = task.id;
        for (const location of task.locations)
            this.locationIndex[taskLocationStr(location)] = task.id;
        for (const childId of task.children) {
            if (!(childId in this.parents))
                this.parents[childId] = new Set();
            this.parents[childId].add(task.id);
        }
    }

    public createTask(name: string, locations: TaskLocation[]): ITask {
        const id = this.nextId++;
        const task = {
            ...emptyTask(),
            id,
            name,
            locations: locations,
        };
        this.tasks[id] = task;
        this.tasksByName[task.name] = task.id;
        return this.tasks[id];
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

        this.updateSupportIndexesFromTask(t);

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
        this.deletedTasks[id] = deleted;
        return deleted;
    }

    clear() {
        this.tasks = {};
        this.cache = {};
        this.locationIndex = {};
        this.parents = {};
        this.nextId = 0;
        this.deletedTasks = {};
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
        const lineNumbers = this.getFilePositions(task, filepath).sort();
        return lineNumbers.reduce((cache, lineNumber) => {
            const ret: TaskCacheItem = {
                id,
                name,
                complete,
                lineNumber,
                parent: -1
            };
            const parent = this.getFileParent(task, filepath) || emptyTask();
            const parentLineNumbers = this.getFilePositions(parent, filepath).sort();
            if (parentLineNumbers.length > 0) {
                for (const parentLine of parentLineNumbers) {
                    if (parentLine > ret.parent && parentLine < lineNumber)
                        ret.parent = parentLine;
                }
                ret.parentId = parent.id;
            }
            return {
                ...cache,
                [lineNumber]: ret
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

    public getFilePositions({locations}: ITask, filepath: string): number[] {
        return locations.filter(loc => loc.filePath === filepath).map(loc => loc.lineNumber);
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
                    task = this.createTask(item.name, [{filePath: file.path, lineNumber: item.lineNumber}]);
                } else {
                    // task already exists, add this location
                }
            }
        }
    }

    public handleFileCacheUpdate(file: TFile, prev: FileTaskCache, current: FileTaskCache) {
        for (const prevLineNum in prev) {
            const prevItem = prev[prevLineNum];
            if (Number.parseInt(prevLineNum) !== prevItem.lineNumber)
                throw new Error(`Prev Index ${prevLineNum} does not match cache line number ${prevItem.lineNumber} for task: ${prevItem.name}`);
            const loc: TaskLocation = {filePath: file.path, lineNumber: prevItem.lineNumber};
            if (!(prevLineNum in current)) {
                this.deleteTaskLocation(prevItem.id, loc)
            } else {
                const currItem = current[prevLineNum];
                if (prevItem.id !== currItem.id) {
                    this.deleteTaskLocation(prevItem.id, loc)
                }
            }
        }

        for (const currLineNum in current) {
            const currItem = current[currLineNum];
            if (Number.parseInt(currLineNum) !== currItem.lineNumber)
                throw new Error(`Prev Index ${currLineNum} does not match cache line number ${currItem.lineNumber} for task: ${currItem.name}`);
            const currLocation: TaskLocation = {filePath: file.path, lineNumber: currItem.lineNumber};
            let task: ITask;
            if (currItem.id === -1) {
                if (!this.taskExists(currItem.name))
                    task = this.createTask(currItem.name, [currLocation]);
                else {
                    task = this.getTaskByName(currItem.name);
                }
            } else {
                task = this.getTaskById(currItem.id);
            }
            task.complete = currItem.complete;
            const foundLocation = task.locations.find(loc => locationsEqual(loc, currLocation));
            if (!foundLocation)
                task.locations.push(currLocation);
            this.updateTask(task);

            if (currItem.parent > -1) {
                const parentItem = current[currItem.parent];
                const parentTask = this.getTaskByName(parentItem.name);
                if (!parentTask)
                    throw new Error(`No parent task found for ${currItem.name}.`)
                if (!(task.id in parentTask.children))
                    parentTask.children.push(task.id);
                this.updateTask(parentTask);
            } else {
                // parent == -1,
                // if prev parent wasn't -1, then we remove the parent/child relationship if this was the only
                // location to represent it
                if (currItem.id > -1) {
                    for (const prevLine in prev) {
                        const prevItem = prev[prevLine];
                        if (prevItem.id === currItem.id && prevItem.parent > -1) {
                            const prevParent = this.getTaskByName(prevItem.parentName);
                            prevParent.children.remove(currItem.id);
                            this.updateTask(prevParent);
                        }
                    }
                }
            }
        }
        return this.updateIndex();
    }

    public deleteAllFileLocations(path: string) {
        for (const task of this.getTasksByFilepath(path)) {
            task.locations = [...task.locations.filter(l => l.filePath !== path)];
            this.updateTask(task);
        }
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

    private deleteTaskLocation(taskId: number, location: TaskLocation) {
        if (!this.taskExists(taskId))
            return;

        const task = this.getTaskById(taskId);
        const newLocations = [...task.locations.filter(loc => !locationsEqual(loc, location))]
        this.updateTask({...task, locations: newLocations});
    }

    private addTaskLocation(taskId: number, location: TaskLocation) {
        if (!this.taskExists(taskId))
            return;

        const task = this.getTaskById(taskId);
        const existing = task.locations.find(loc => locationsEqual(loc, location));
        if (existing)
            return;
        else
            this.updateTask({...task, locations: [...task.locations, location]});
    }

    public getAllTasks() {
        return Object.values(this.tasks).sort((a, b) => a.id - b.id);
    }

    public getAllFilesWithTasks() {
        const paths: Set<string> = new Set();
        for (const task of Object.values(this.tasks)) {
            for (const loc of task.locations)
                paths.add(loc.filePath)
        }
        return Array.from(paths);
    }

    public updateFromFile(path: string, record: FileTaskRecord) {
        this.deleteAllFileLocations(path);
        for (const line in record) {
            const lineNumber = Number.parseInt(line);
            const recordTask = record[lineNumber];
            let task: ITask;
            if (recordTask.id === -1) {
                if (!this.taskExists(recordTask.name))
                    task = this.createTask(recordTask.name, recordTask.locations);
                else
                    task = this.getTaskByName(recordTask.name);
                recordTask.id = task.id;
            } else {
                if (!this.taskExists(recordTask.id)) {
                    this.nextId = recordTask.id;
                    task = this.createTask(recordTask.name, recordTask.locations);
                }
                else
                    task = this.getTaskById(recordTask.id);
            }
            task.name = recordTask.name;
            task.complete = recordTask.complete;
            if (!task.locations.find(l => locationsEqual(l, {filePath: path, lineNumber})))
                task.locations.push({filePath: path, lineNumber});
            this.updateTask(task);
        }

        // handle children now that all items have an id
        for (const line in record) {
            const recTask = record[line];
            if (recTask.children?.length > 0) {
                const task = this.getTaskById(recTask.id);
                recTask.children.map(childLine => {
                    const recChild = record[childLine];
                    if (!task.children.includes(recChild.id))
                        task.children.push(recChild.id);
                });
                this.updateTask(task);
            }
        }
        return this.updateIndex();
    }
}