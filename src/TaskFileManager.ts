import {FileSystemAdapter, MetadataCache, TFile, TFolder, Vault} from "obsidian";
import {IAnonymousTask, ITask, Task, TaskRecordType, TaskStatus, TaskYamlObject} from "./Task";
import {keys} from "ts-transformer-keys";
import {clone, pick} from 'lodash';
import TaskParser from "./TaskParser";
import {TaskIndex} from "./TaskIndex";

type FileTreeNode = {
    name: string;
    children: FileTreeNode[]
}

export class TaskFileManager {
    private tasksDirString: string;
    private _tasksDirectory: TFolder;
    private vault: Vault;
    private mdCache: MetadataCache;

    constructor(vault: Vault, cache: MetadataCache, tasksDirectory: string = 'tasks') {
        this.vault = vault;
        this.mdCache = cache;
        this.tasksDirString = tasksDirectory;
        this._tasksDirectory = this.vault.getAbstractFileByPath(tasksDirectory) as TFolder;
    }

    public get tasksDirectory() {
        return this._tasksDirectory;
    }

    public set tasksDirectory(dir: TFolder) {
        this._tasksDirectory = dir;
    }

    public getTaskFile(name: string): TFile {
        if (name.endsWith('.md'))
            name = name.slice(0, name.length - 3);
        return this.mdCache.getFirstLinkpathDest(name, this._tasksDirectory.path);
    }

    public saveTask(task: ITask) {
        // write this task to its dedicated task file
        // for each of its locations, write the task and children in anon form
        this.storeTaskFile(task)
            .then(() => this.writeTaskToLocations(task))
    }

    public storeTaskFile(task: ITask) {
        const taskFile: TFile = this._tasksDirectory.children
            .filter(f => f.name === task.name)[0] as TFile;
        const t = Task.fromITask(task);
        return this.vault.modify(taskFile, t.toFileContents())
    }

    public writeTaskToLocations(task:ITask) {
        for (const {filePath, line} of task.locations) {
            const file = this.vault.getAbstractFileByPath(filePath) as TFile;
            const cache = this.mdCache.getFileCache(file);
            const lis = cache.listItems;
            let offset = 0;
            for (const li of lis) {
                if (li.position.start.line === line) {
                    offset = li.position.start.col * this.getAppConfig().tabSize;
                    break;
                }
            }
            this.vault.read(file)
                .then(data => {
                    const lines = data.split('\n').filter(l => l);
                    lines.splice(line, 1, this.createTaskLine(task, offset));
                    const newContents = lines.join('\n') + '\n';
                    return this.vault.modify(file, newContents);
                })
                .then(() => {
                    // emit saved event?
                })
                .catch(err => {
                    console.log(err);
                })
        }
    }

    public createTaskLine(task: ITask, offset: number = 0): string {
        const bullet = `- [${task.status === TaskStatus.DONE ? 'x' : ''}]`;
        const indent = new Array(offset).fill(' ').join('');
        return `${indent}${bullet} ${task.name}`;
    }

    public getAppConfig() {
        return (this.vault as any).config;
    }

    public isTaskFile(file: TFile): boolean {
        const cache = this.mdCache.getFileCache(file);
        return (
            file.path.contains(this.tasksDirString) &&
            cache.frontmatter && cache.frontmatter.type &&
            cache.frontmatter.type === TaskRecordType
        );
    }

    public async parseTasksFromFile(tFile: TFile, witnessed: TaskIndex = new TaskIndex()): Promise<[ITask|null, Record<number, IAnonymousTask>|null]> {
        // has front matter?
        const cache = this.mdCache.getFileCache(tFile);
        if (cache.frontmatter &&
            cache.frontmatter.type &&
            cache.frontmatter.type === TaskRecordType) {
            const task = await this.getTaskFromTaskFile(tFile, witnessed);
            return [task, null];
        }
        else {
            // file contents contain anon tasks only
            const record = await this.getTasksFromFile(tFile);
            return [null, record];
        }
    }

    public async getTasksFromFile(file: TFile): Promise<Record<number, IAnonymousTask>> {
        const cache = this.mdCache.getFileCache(file);
        return this.vault.read(file)
            .then(contents => {
                const tasksRecord = TaskParser.parseLinesToRecord(file.path, contents);
                // add parent/child relationships if they exist
                for (const cacheListItem of cache.listItems) {
                    if (cacheListItem.parent > -1) {
                        // this list item has a parent
                        // parent is a task
                        //      this item is a task, add this to parent and parent to this
                        //      if this is not a task, append to parent description
                        const parentLine = cacheListItem.parent;
                        const parent = clone(tasksRecord[parentLine]);
                        if (!parent) {
                            // this implies that a subtask is nested under a list item that is not
                            // a task
                            // TODO: add task creation
                            // TODO: also consider the situation where a list item is a parent, but its
                            //   children are not tasks? Maybe add them to the parent's description
                            // for now, just skip
                            continue;
                        }

                        // there is a parent, it's a task and this is a task
                        if (cacheListItem.task) {
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
            })
    }

    public async getTaskFromTaskFile(file: TFile, witnessed: TaskIndex = new TaskIndex()): Promise<ITask> {
        const cache = this.mdCache.getFileCache(file);
        const taskYml: TaskYamlObject = pick(cache.frontmatter, ['name', 'locations', 'status', 'created', 'updated', 'parents', 'children']);
        const task = Task.flatFromYamlObject(taskYml);
        task.name = task.name ?? file.basename;
        if (witnessed.taskExists(task.name)) {
            return witnessed.getTaskByName(task.name);
        }
        witnessed.addTask(task);
        task.children = await this.buildTasksFromList(task.children, witnessed);
        task.parents = await this.buildTasksFromList(task.parents, witnessed);
        const contentStart = cache.sections[0].position.end.line + 1;
        const contents = await this.vault.cachedRead(file)
            .then(data => data.split('\n').slice(contentStart))
            .then(lines => lines.join('\n'));
        task.description = contents;
        witnessed.updateTask(task);
        return task;
    }

    private buildTasksFromList(tasks: ITask[], witnessed: TaskIndex = new TaskIndex()): Promise<ITask[]> {
        const taskPromises = tasks
            .map(task => {
                if (witnessed.taskExists(task.name)) {
                    return witnessed.getTaskByName(task.name);
                }
                return this.getTaskFromTaskFile(this.getTaskFile(task.name), witnessed)
            });
        return Promise.all<ITask>(taskPromises);
    }

    private buildFileTree(taskYml: TaskYamlObject, witnessedNames: Set<string> = new Set()) {
        const seen: Set<string> = new Set(taskYml.name);
        let parents = taskYml.parents;
        const roots = [];
        while (parents.length > 0) {
            const currentParent = parents.pop();
            if (seen.has(currentParent))
                continue;

            seen.add(currentParent);
            const parentFile = this.getTaskFile(currentParent);
            const newParents = this.mdCache.getFileCache(parentFile).frontmatter.parents;
            if (newParents.length > 0) {
                parents.concat(newParents.filter());
            }
            else {
                roots.push(currentParent)
            }
        }
    }

    private updateBacklog(allTasks: ITask[]) {
        let task: ITask;
        const contents: string[] = [];
        for (let i = 0; i < allTasks.length; i++) {
            task = allTasks[i];
            if (task.status === TaskStatus.TODO) {
                if (task.parents.length > 0)
                    continue;
                contents.push(...Task.asChecklist(task,this.getAppConfig().tabSize || 4))
            }
        }
        const backlog = this.vault.getMarkdownFiles().filter(f => f.name.startsWith('Backlog'))[0];
        this.vault.modify(backlog, contents.join('\n'))
            .then(() => {
                // backlog updated
            });
    }
}