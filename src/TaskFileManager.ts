import {EventRef, MetadataCache, TAbstractFile, TFile, TFolder, Vault} from "obsidian";
import {
    fullTaskChecklist,
    getTaskFromYaml, hashTask,
    ITask,
    ITaskTree, parseTaskFilename,
    Task, taskAsChecklist,
    TaskRecordType,
    taskToFileContents, taskToFilename,
    TaskYamlObject
} from "./Task";
import {keys} from "ts-transformer-keys";
import {clone, isEmpty, pick} from 'lodash';
import TaskParser from "./Parser/TaskParser";
import {TaskIndex} from "./TaskIndex";
import {fileCachesEqual, fileTaskCacheToRecord, getFileTaskCache, hashTaskCache, validateCaches} from "./File";
import {FileTaskCache, FileTaskRecord} from "./File/types";
import pathKey from "path-key";

type FileTreeNode = {
    name: string;
    children: FileTreeNode[]
}

export class TaskFileManager {
    private tasksDirString: string;
    private _tasksDirectory: TFolder;
    private vault: Vault;
    private mdCache: MetadataCache;
    private taskHashes: Record<string, string>;
    private fileTaskCaches: Record<string, FileTaskCache>;

    constructor(vault: Vault, cache: MetadataCache, tasksDirectory = 'tasks') {
        this.vault = vault;
        this.mdCache = cache;
        this.tasksDirString = tasksDirectory;
        this._tasksDirectory = this.vault.getAbstractFileByPath(tasksDirectory) as TFolder;
        if (!this._tasksDirectory) {
            this.vault.createFolder(tasksDirectory)
                .then(() => {
                    this._tasksDirectory = this.vault.getAbstractFileByPath(tasksDirectory) as TFolder;
                });
        }
        this.fileTaskCaches = {};
        this.taskHashes = {}
    }

    public get tasksDirectory() {
        return this._tasksDirectory;
    }

    public set tasksDirectory(dir: TFolder) {
        this._tasksDirectory = dir;
    }

    public updateTaskDirectoryName(name: string) {
        this.tasksDirString = name;
        this.vault.rename(this._tasksDirectory, name)
            .then(() => {
                this._tasksDirectory = this.vault.getAbstractFileByPath(name) as TFolder;
            });
    }

    public getTaskFile(name: string): TFile {
        if (name.endsWith('.md'))
            name = name.slice(0, name.length - 3);
        return this.mdCache.getFirstLinkpathDest(name, this._tasksDirectory.path);
    }

    // public saveTask(task: ITask) {
    //     // write this task to its dedicated task file
    //     // for each of its locations, write the task and children in anon form
    //     this.storeTaskFile(task)
    //         .then(() => this.writeTaskToLocations(task))
    // }

    public async storeTaskFile(task: ITask) {
        const fullPath = this.getTaskPath(task);
        const file = this.vault.getAbstractFileByPath(fullPath);
        this.taskHashes[fullPath] = await hashTask(task);
        if (!file) {
            return this.vault.create(fullPath, taskToFileContents(task));
        } else {
            return this.vault.modify(file as TFile, taskToFileContents(task))
        }
    }

    public getAppConfig() {
        return (this.vault as any).config;
    }

    public isTaskFile(file: TFile): boolean {
        const pathParts = file.path.split('/');
        if (pathParts.length < 2)
            return false;
        const parent = pathParts[pathParts.length - 2];
        if (parent !== this.tasksDirString)
            return false;
        const {name, id} = parseTaskFilename(file);
        if (!(name && id))
            return false;
        const cache = this.mdCache.getFileCache(file);
        if (cache) {
            return (
                cache.frontmatter && cache.frontmatter.type &&
                cache.frontmatter.type === TaskRecordType
            );
        }
        return true;
    }

    public async readTaskFile(file: TFile): Promise<ITask> {
        const cache = this.mdCache.getFileCache(file);
        const taskYml: TaskYamlObject = pick(cache.frontmatter, ['type', 'id', 'name', 'locations', 'complete', 'created', 'updated', 'parents', 'children']);
        const task = getTaskFromYaml(taskYml);
        task.name = task.name ?? file.basename;
        const contentStart = cache.frontmatter.position.end.line + 1;
        const contents = await this.vault.read(file)
            .then(data => data.split('\n').slice(contentStart))
            .then(lines => lines.join('\n'));
        task.description = contents;
        const hash = await hashTask(task);
        this.taskHashes[file.path] = hash;
        return task;
    }

    public async getFileTaskCache(file: TFile): Promise<FileTaskCache> {
        const contents = await this.vault.read(file);
        const fileMdCache = this.mdCache.getFileCache(file);
        return getFileTaskCache(fileMdCache, contents);
    }

    public updateFileTaskCache(filepath: string, newCache: FileTaskCache) {
        this.fileTaskCaches[filepath] = newCache
    }

    public async readNoteFile(file: TFile): Promise<FileTaskRecord> {
        const taskCache = await this.getFileTaskCache(file)
        this.fileTaskCaches[file.path] = taskCache;
        if (!isEmpty(taskCache)) {
            return fileTaskCacheToRecord(file.path, taskCache);
        }
        return {};
    }

    private updateBacklog(allTasks: ITaskTree[]) {
        const seen: Set<number> = new Set();
        let task: ITaskTree;
        const contents: string[] = [];
        for (let i = 0; i < allTasks.length; i++) {
            task = allTasks[i];
            if (!task.complete && !(task.id in seen)) {
                contents.push(fullTaskChecklist(task))
                seen.add(task.id);
                const children = [...task.children];
                while (children.length) {
                    const nextChild = children.pop();
                    seen.add(nextChild.id);
                    children.push(...nextChild.children.filter(c => !seen.has(c.id)));
                }
            }
        }
        const backlog = this.vault.getMarkdownFiles().filter(f => f.name.startsWith('Backlog'))[0];
        this.vault.modify(backlog, contents.join('\n'))
            .then(() => {
                // backlog updated
            });
    }

    public async writeCacheToFile(file: TFile, cache: FileTaskCache) {
        const contents = await this.vault.read(file);
        const oldCache = getFileTaskCache(this.mdCache.getFileCache(file), contents);
        validateCaches(oldCache, cache);
        const contentLines = contents.split('\n');
        const config: any = (this.vault as any).config;
        let useTab = true;
        let tabSize = 4;
        if (config.hasOwnProperty('useTab'))
            useTab = config.useTab;
        if (config.hasOwnProperty('tabSize'))
            tabSize = config.tabSize;
        for (const line in cache) {
            const cacheItem = cache[line];
            let indent = 0;
            let parent = cacheItem.parent;
            while (parent > -1) {
                indent++;
                parent = cache[parent].parent;
            }
            const taskChecklist = taskAsChecklist({
                id: cacheItem.id,
                name: cacheItem.name,
                complete: cacheItem.complete
            });
            const space = new Array(useTab ? indent : indent * tabSize).fill(useTab ? '\t': ' ').join('');
            contentLines[line] = `${space}${taskChecklist}`;
        }
        this.fileTaskCaches[file.path] = cache;
        return this.vault.modify(file, contentLines.join('\n'));
    }

    public getTaskPath(task: ITask): string {
        return `${this.tasksDirectory.path}/${taskToFilename(task)}`;
    }

    public async storeTasks(index: TaskIndex) {
        for (const task of index.getAllTasks()) {
            const taskHash = await hashTask(task);
            const path = this.getTaskPath(task);
            if (!(path in this.taskHashes) || this.taskHashes[path] !== taskHash) {
                await this.storeTaskFile(task);
            }
        }
        const filePaths = index.getAllFilesWithTasks();
        for (const filepath of filePaths) {
            const cache = index.getTaskCacheForFile(filepath);
            if (!(filepath in this.fileTaskCaches) || !fileCachesEqual(this.fileTaskCaches[filepath], cache)) {
                const file = this.vault.getAbstractFileByPath(filepath) as TFile;
                await this.writeCacheToFile(file, cache);
            }
        }
    }

    public deleteFile(file: TAbstractFile) {
        delete this.fileTaskCaches[file.path];
    }

    public async deleteTasks(record: Record<number, ITask>) {
        const delProms: Promise<void>[] = [];
        for (const id in record) {
            const task = record[id];
            const fullPath = this.getTaskPath(task);
            const file = this.vault.getAbstractFileByPath(fullPath);
            delete this.taskHashes[fullPath];
            if (file)
                delProms.push(this.vault.delete(file));
        }

        await Promise.all(delProms);
        const modProms: Promise<void>[] = [];
        for (const id in record) {
            const task = record[id];
            for (const loc of task.locations) {
                const locFile = this.vault.getAbstractFileByPath(loc.filePath);
                const contents = await this.vault.read(locFile as TFile);
                const lines = contents.split('\n');
                lines[loc.lineNumber] = '\n';
                modProms.push(this.vault.modify(locFile as TFile, lines.join('\n')));
            }
        }
        return Promise.all(modProms);
    }
}