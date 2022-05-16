import {EventRef, MetadataCache} from "obsidian";
import {IndexedTask, NonEmptyString, Task, TaskID, TaskLocation} from "./Task/types";
import {compareArrays, hashTask, locationsEqual, taskLocationStr} from "./Task";
import {FileTaskRecord} from "./File/types";
import {TaskEvents} from "./Events/TaskEvents";
import {emptyIndexedTask, taskIdToTid, taskTidToId} from "./Task/Task";


export const getParentIds = (
  newTasks: Record<TaskID, IndexedTask>,
  locations: TaskLocation[],
  record: FileTaskRecord
): number[] => locations.filter(l=>l.cacheItemParent>=0)
  .reduce((tids: string[],{cacheItemParent})=>[...tids,record[cacheItemParent].name], [])
  .map(pn => Object.values(newTasks).find(({name}) => name === pn).id);

export const filterUnique = <T>(
  array: T[],
  filterComp: (a:T, b: T) => boolean = (a, b) => a && b && a === b
    ): T[] => {
    return array.filter((val, i, arr) => arr.findIndex(v => filterComp(val, v)) === i)
}

export class TaskIndex {
    private tasks: Record<number, IndexedTask>;
    private deletedTasks: Record<number, IndexedTask>;
    private locationIndex: Record<string, number>;
    private tasksByName: Record<string, number>;
    private parents: Record<number, Set<number>>;
    private cache: Record<number, string>;
    private nextId: number;
    private cacheEventRefs: EventRef[];
    private vaultEventRefs: EventRef[];
    private loaded = false;
    private events: TaskEvents;

    constructor(tasks: Task[] = [], events: TaskEvents) {
        this.events = events;
        this.tasks = {};
        this.deletedTasks = {};
        this.locationIndex = {};
        this.tasksByName = {};
        this.parents = {};
        this.cache = {};
        let nextId = tasks.length > 0 ? Math.max(...tasks.map(t => Number.parseInt(t.id, 16) || 0)) + 1 : 100000;
        for (let i = 0; i < tasks.length; i++) {
            let task: IndexedTask;
            if (tasks[i].id.length === 0)
                task = this.createTask(tasks[i].name, tasks[i].locations)
                task.id = nextId.toString(16) as NonEmptyString;
            this.tasks[nextId] = task;
            hashTask(task).then(hash => {
                this.cache[nextId] = hash;
            });
            nextId++;
        }
        this.updateIndex();
        this.nextId = nextId;
    }

    // public async subscribeToVaultEvents(vault: Vault) {
    //     const ref = vault.on('create', file => {
    //         if (file instanceof TFile) {
    //         }
    //     });
    // }

    public async subscribeToCacheEvents(cache: MetadataCache) {}

    public unload() {}

    public broadcastUpdate() {
        this.events.triggerIndexUpdate({index: {...this.tasks}, taskState: {...this.locationIndex}});
    }

    public async updateIndex() {
        const newIndex = {...this.tasks};
        const deletedTasks: Record<TaskID, IndexedTask> = {};
        for (const idStr in newIndex) {
            const id = Number.parseInt(idStr);
            newIndex[id].parentUids = [];
            newIndex[id].childUids = [];
            newIndex[id].childTids = [];
            if (newIndex[id].locations.length === 0) {
                deletedTasks[id] = newIndex[id];
                delete newIndex[id];
            }
        }
        this.updateLocationIndex(newIndex);
        this.updateParentIndex(newIndex);
        this.updateTasksByName(newIndex);

        for (const idStr in newIndex) {
            const id = Number.parseInt(idStr);
            const task = {...newIndex[id]};
            task.parentUids = [...(this.parents[task.uid] || [])];
            task.childUids = Object.keys(this.parents).map(Number.parseInt)
              .filter(cid => task.uid in this.parents[cid]);
            task.childTids = task.childUids.map(taskIdToTid);
            newIndex[id] = task;
        }

        const newCacheArr = await Promise.all(Object.entries(newIndex).map(async ([id, task]) => (Promise.all([Number.parseInt(id), hashTask(task)]))));
        const newCache: Record<number, string> = newCacheArr.reduce((c, [id, taskHash]) => {
            c[id] = taskHash;
            return c;
        }, {} as Record<TaskID, string>);
        const [deletedIds, newIds] = compareArrays(Object.keys(this.cache), Object.keys(newCache));
        const [cacheDeleted, deleted] = compareArrays(deletedIds, Object.keys(deletedTasks).map(id => `${id}`));
        if (cacheDeleted.length > 0)
            throw new Error(`Deleted IDs from cache not in deletedTasks. ${cacheDeleted.join(',')}`);
        if (deleted.length > 0)
            throw new Error(`Deleted IDs from deletedTasks not reflected in cache. ${deleted.join(',')}`);
        const updatedIds: number[] = [];
        for (const newId in newCache) {
            if (newId in this.cache && this.cache[newId] !== newCache[newId])
                updatedIds.push(Number.parseInt(newId));
        }
        this.cache = newCache;
        const dirtyTasks: Record<number, IndexedTask> = [...updatedIds, ...newIds.map(Number.parseInt)].reduce((ret, id) => {
            if (!(id in ret))
                ret[id] = this.getTaskById(id);
            return ret;
        }, {} as Record<number, IndexedTask>);
        return {dirtyTasks, deletedTasks};
    }

    private updateLocationIndex(index: Record<TaskID, IndexedTask>) {
        this.locationIndex = Object.keys(index).reduce((locs, id) => {
            const indexId = Number.parseInt(id)
            const task = this.tasks[indexId]
            for (const tLoc of task.locations) {
                locs[taskLocationStr(tLoc)] = indexId;
            }
            return locs;
        }, {} as Record<string, number>);
    }

    private updateParentIndex(index: Record<TaskID, IndexedTask>) {
        const newParents: Record<number, Set<number>> = {};
        for (const task of Object.values(index)) {
            for (const pLoc of task.parentLocations) {
                const pid = this.locationIndex[taskLocationStr(pLoc)];
                if (!(task.id in newParents))
                    newParents[task.id] = new Set();
                newParents[task.id].add(pid)
            }
        }
        this.parents = newParents;
    }

    private updateTasksByName(index: Record<TaskID, IndexedTask>) {
        this.tasksByName = Object.values(index).reduce((record, task) => {
            record[task.name] = task.id;
            return record;
        }, {} as Record<string, number>);
    }

    public createTask(name: string, locations: TaskLocation[]): IndexedTask {
        const id = this.nextId++;
        const task: IndexedTask = {
            ...emptyIndexedTask(),
            name,
            locations,
            id: taskIdToTid(id),
            uid: id,
        };
        return this.insertTask(task);
    }

    public insertTask(t: Task|IndexedTask) {
        if (!TaskIndex.validateTask(t))
            throw TypeError(`Task is invalid ${t}`)

        if (this.taskExists(t.name) || this.taskExists(t.id) || (TaskIndex.taskIsIndexed(t) && this.taskExists(t.uid)))
            return;

        const id = this.nextId++;
        const newTask: IndexedTask = {
            ...emptyIndexedTask(),
            ...t,
            uid: id,
            id: taskIdToTid(id)
        };

        this.tasks[id] = newTask;
        this.tasksByName[newTask.name] = newTask.uid;

        this.updateIndex()

        return this.tasks[newTask.uid];
    }

    public static taskIsIndexed(t: Task|IndexedTask): t is IndexedTask {
        if (t.hasOwnProperty('id')) {
            // @ts-ignore
            return t['id'] > 0
        }
    }

    public static validateTask(t: Task|IndexedTask) {
        const idxId = taskTidToId(t.id);
        if (TaskIndex.taskIsIndexed(t)) {
            return idxId === t.uid &&
              t.created instanceof Date && t.created > new Date(0) &&
              t.updated instanceof Date && t.updated >= t.created;
        }

        return t.name.length > 0 && isBoolean(t.complete) && (t.id === '' || !isNaN(idxId));
    }

    public addTasks(tasks: IndexedTask[]) {
        return tasks.map(this.insertTask);
    }

    taskExists(name: string | number) {
        if (typeof name === 'number') {
            return this.tasks.hasOwnProperty(name);
        }
        else {
            const id = Number.parseInt(name, 16);
            return (!isNaN(id) && this.tasks.hasOwnProperty(id)) || this.tasksByName.hasOwnProperty(name);
        }
    }

    deleteLocations(taskId: number, locs: TaskLocation[]) {
        for (let i = 0; i < locs.length; i++) {
            delete this.locationIndex[taskLocationStr(locs[i])];
        }
    }

    deleteTask(t: IndexedTask | string | number) {
        const id: number = typeof t === 'string' ? this.tasksByName[t] : typeof t === 'number' ? t : t.uid;
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
        this.nextId = 100000;
        this.deletedTasks = {};
    }

    updateTask(t: IndexedTask) {
        this.tasks[t.uid] = {
            ...(this.tasks[t.uid] || emptyIndexedTask()),
            ...t,
            updated: new Date(),
        };
        this.updateIndex();
        return this.tasks[t.uid];
    }

    public getTaskById(id: number): IndexedTask {
        return {...this.tasks[id]};
    }

    public getTaskByTid(tid: string): IndexedTask {
        return {...this.tasks[Number.parseInt(tid, 16)]}
    }

    public getTaskByName(name: string): IndexedTask | null {
        return {...this.tasks[this.tasksByName[name]]} || null;
    }

    public getTasksByFilepath(filepath: string): IndexedTask[] {
        return Object.keys(this.locationIndex)
            .filter(k => k.split(':')[0] === filepath)
            .map(k => ({...this.tasks[this.locationIndex[k]]}));
    }

    public getIndexedFileTaskRecord(filepath: string): FileTaskRecord {
        const tasks = this.getTasksByFilepath(filepath);
        return tasks.reduce((cache, task) => {
            return {
                ...cache,
                ...this.taskToRecord(task, filepath)
            }
        }, {});
    }

    public taskToRecord(task: IndexedTask, filepath: string): FileTaskRecord {
        const lineNumbers = this.getFilePositions(task, filepath).sort();
        return lineNumbers.reduce((cache, lineNumber) => {
            return {
                ...cache,
                [lineNumber]: task
            };
        }, {});
    }

    public getFilePositions({locations}: IndexedTask, filepath: string): number[] {
        return locations.filter(loc => loc.filePath === filepath).map(loc => loc.lineNumber);
    }

    public deleteAllFileLocations(path: string) {
        for (const task of this.getTasksByFilepath(path)) {
            task.locations = [...task.locations.filter(l => l.filePath !== path)];
            task.parentLocations = [...task.parentLocations.filter(l => l.filePath !== path)]
            this.tasks[task.uid] = {...task}
        }
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
        const sortedLines = Object.keys(record).map(Number.parseInt).sort()
        const tasks: Record<TaskID, IndexedTask> = sortedLines.reduce((newTasks, line) => {
            const {
                name, id, complete, locations,
                tags, recurrence, description, dueDate, parentLocations
            } = record[line];
            const recIdxId = taskTidToId(id);
            const newTask = isNaN(recIdxId) ? this.createTask(name, locations) : this.getTaskById(recIdxId);
            const newLocations: TaskLocation[] = filterUnique(
              newTask.locations.filter(l => l.filePath !== path).concat(locations), locationsEqual
            );
            const parentLocs: TaskLocation[] = filterUnique(
              newTask.parentLocations.filter(l => l.filePath !== path).concat(parentLocations), locationsEqual
            );
            return {
                ...newTasks,
                [newTask.uid]: {
                    ...newTask,
                    complete, tags, description, recurrence, dueDate,
                    parentLocations: parentLocs,
                    locations: newLocations,
                }
            };
        }, {} as Record<TaskID, IndexedTask>)

        this.tasks = {
            ...this.tasks,
            ...tasks
        }

        return this.updateIndex();
    }
}