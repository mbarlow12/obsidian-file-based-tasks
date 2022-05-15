import {EventRef, FrontMatterCache, MetadataCache, TAbstractFile, TFile, TFolder, Vault} from "obsidian";
import {
    getTaskFromYaml,
    hashTask,
    IndexedTask,
    parseTaskFilename,
    taskAsChecklist,
    TaskRecordType,
    taskToFileContents,
    taskToFilename,
    TaskYamlObject
} from "./Task";
import {TaskIndex} from "./TaskIndex";
import {fileRecordsEqual, getFileTaskRecord, validateRecords} from "./File";
import {FileTaskRecord} from "./File/types";
import {TaskEvents} from "./Events/TaskEvents";
import {TaskModifiedData} from "./Events/types";

type FileTreeNode = {
    name: string;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    children: FileTreeNode[]
}

export class TaskFileManager {
    private tasksDirString: string;
    private _tasksDirectory: TFolder;
    private vault: Vault;
    private mdCache: MetadataCache;
    private taskHashes: Record<string, string>;
    private fileTaskCaches: Record<string, FileTaskRecord>;
    private events: TaskEvents;
    private taskStoreEventRef: EventRef;

    constructor(vault: Vault, cache: MetadataCache, events: TaskEvents, tasksDirectory = 'tasks') {
        this.vault = vault;
        this.mdCache = cache;
        this.events = events;
        this.taskStoreEventRef = this.events.registerIndexUpdateHandler(this.handleIndexUpdate.bind(this))
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

    public handleIndexUpdate({index, locations}: TaskModifiedData) {}

    public handleFileCacheChanged(aFile: TAbstractFile) {}

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

    public async storeTaskFile(task: IndexedTask) {
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

    private static taskYamlFromFrontmatter(cfm: FrontMatterCache): TaskYamlObject {
        const {
            type, id, name, locations, complete, created, updated, parents, children, recurrence
        } = cfm;
        return {
            type, id, name, locations, complete, created, updated, parents, children, recurrence
        } as unknown as TaskYamlObject
    }

    public async readTaskFile(file: TFile): Promise<IndexedTask> {
        const cache = this.mdCache.getFileCache(file);
        const taskYml: TaskYamlObject = TaskFileManager.taskYamlFromFrontmatter(cache.frontmatter)
        const task = getTaskFromYaml(taskYml);
        task.name = task.name ?? file.basename;
        const contentStart = cache.frontmatter.position.end.line + 1;
        task.description = await this.vault.read(file)
          .then(data => data.split('\n').slice(contentStart))
          .then(lines => lines.join('\n'));
        this.taskHashes[file.path] = await hashTask(task);
        return task;
    }

    public async getFileTaskRecord(file: TFile): Promise<FileTaskRecord> {
        const contents = await this.vault.read(file);
        const fileMdCache = this.mdCache.getFileCache(file);
        return getFileTaskRecord(file, fileMdCache, contents);
    }

    public async readNoteFile(file: TFile): Promise<FileTaskRecord> {
        const fileTaskRecord = await this.getFileTaskRecord(file)
        this.fileTaskCaches[file.path] = fileTaskRecord;
        return fileTaskRecord;
    }

    public async writeRecordToFile(file: TFile, indexRecord: FileTaskRecord) {
        const contents = await this.vault.read(file);
        const fileTaskRecord = getFileTaskRecord(file, this.mdCache.getFileCache(file), contents);
        validateRecords(fileTaskRecord, indexRecord);
        const contentLines = contents.split('\n');
        const config = (this.vault as Vault & {config: Record<string, boolean|number>} ).config;
        let useTab = true;
        let tabSize = 4;
        if (config.hasOwnProperty('useTab') && typeof config.useTab === "boolean")
            useTab = config.useTab;
        if (config.hasOwnProperty('tabSize') && typeof config.tabSize === 'number')
            tabSize = config.tabSize;
        for (const line in indexRecord) {
            const task = indexRecord[line];
            let indent = 0;
            let pLine = task.locations.find(l => l.filePath === file.path && l.lineNumber === Number.parseInt(line)).cacheItemParent;
            while (pLine > -1) {
                indent++;
                pLine = indexRecord[pLine].locations.find(l => l.filePath === file.path && l.lineNumber === pLine).cacheItemParent;
            }
            const taskChecklist = taskAsChecklist({
                id: task.id,
                name: task.name,
                complete: task.complete
            });
            const space = new Array(useTab ? indent : indent * tabSize).fill(useTab ? '\t': ' ').join('');
            contentLines[line] = `${space}${taskChecklist}`;
        }
        this.fileTaskCaches[file.path] = indexRecord;
        return this.vault.modify(file, contentLines.join('\n'));
    }

    public getTaskPath(task: IndexedTask): string {
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
            const indexRecord = index.getIndexedFileTaskRecord(filepath);
            if (!(filepath in this.fileTaskCaches) || !fileRecordsEqual(this.fileTaskCaches[filepath], indexRecord)) {
                const file = this.vault.getAbstractFileByPath(filepath) as TFile;
                await this.writeRecordToFile(file, indexRecord);
            }
        }
    }

    public deleteFile(file: TAbstractFile) {
        delete this.fileTaskCaches[file.path];
    }

    public async deleteTasks(record: Record<number, IndexedTask>) {
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