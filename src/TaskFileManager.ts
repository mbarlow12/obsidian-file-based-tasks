import {FileManager, FileSystemAdapter, MetadataCache, TFile, TFolder, Vault} from "obsidian";
import {FileTaskLine, IAnonymousTask, ITask, Task, TaskRecordType, TaskStatus, TaskYamlObject} from "./Task";
import {keys} from "ts-transformer-keys";
import {pick, clone} from 'lodash';
import TaskParser from "./TaskParser";

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
            this.vault.cachedRead(file)
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
        const vaultPath = (this.vault.adapter as FileSystemAdapter).getBasePath();
        const configPath = `${vaultPath}/${this.vault.configDir}/app.json`;
        return require(configPath);
    }

    public async parseTasksFromFile(tFile: TFile): Promise<ITask|Record<number, IAnonymousTask>> {
        // has front matter?
        const cache = this.mdCache.getFileCache(tFile);
        if (cache.frontmatter &&
            cache.frontmatter.type &&
            cache.frontmatter.type === TaskRecordType) {
            const witnessed: Set<string> = new Set();
            return this.getTaskFromTaskFile(tFile, witnessed)
        }
        else {
            // file contents contain anon tasks only
            return this.getTasksFromFile(tFile);
        }
    }

    public async getTasksFromFile(file: TFile): Promise<Record<number, IAnonymousTask>> {
        const cache = this.mdCache.getFileCache(file);
        return this.vault.cachedRead(file)
            .then(contents => {
                const tasksRecord = TaskParser.parseLinesToRecord(contents);
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

    public async getTaskFromTaskFile(file: TFile, witnessed: Set<string> = new Set()): Promise<ITask> {
        const cache = this.mdCache.getFileCache(file);
        const taskYml: TaskYamlObject = pick(cache.frontmatter, keys<ITask>());
        const task = Task.flatFromYamlObject(taskYml);
        witnessed.add(task.name);
        task.children = await this.buildTasksFromList(task.children, witnessed);
        task.parents = await this.buildTasksFromList(task.parents, witnessed);
        const contentStart = cache.sections[0].position.end.line + 1;
        const contents = await this.vault.cachedRead(file)
            .then(data => data.split('\n').slice(contentStart))
            .then(lines => lines.join('\n'));
        task.description = contents;
        return task;
    }

    private buildTasksFromList(tasks: ITask[], seen: Set<string> = new Set()): Promise<ITask[]> {
        const taskPromises = tasks.filter(task => !seen.has(task.name))
            .map(task => {
                seen.add(task.name);
                return this.getTaskFromTaskFile(this.getTaskFile(task.name), seen)
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
}