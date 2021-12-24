import {
    App,
    debounce,
    FileManager, MarkdownView,
    Modal,
    Notice, parseFrontMatterEntry,
    Plugin,
    PluginManifest,
    PluginSettingTab,
    Setting,
    TAbstractFile, TFile, TFolder
} from 'obsidian';
import {TaskIndex} from "./src/TaskIndex";
import TaskParser, {parseFileContents} from "./src/Parser/TaskParser";
import {FileTaskLine, ITask, parseTaskFilename, Task, TaskLocation} from "./src/Task";
import {TaskFileManager} from "./src/TaskFileManager";
import {entries, intersection, isEqual} from 'lodash';
import {TaskEvents} from "./src/Events/TaskEvents";
import {FileTaskCache} from "./src/File/types";
import {fileTaskCacheToTaskList, getFileTaskCache, hashTaskCache} from "./src/File";
import globals from './src/globals';

const DEFAULT_SETTINGS: TaskManagerSettings = {
    taskDirectoryName: 'tasks',
    backlogFileName: 'Backlog',
    completedFileName: 'Completed',
    taskTitlePrefix: '',
}
/**
 * on startup, process all the files in the vault, looking for the checklist regex
 */
export default class ObsidianTaskManager extends Plugin {
    settings: TaskManagerSettings;
    index: TaskIndex;
    taskFileManager: TaskFileManager;
    // filepath: task cache
    fileTaskCaches: Record<string, FileTaskCache>;
    private initialized = false;
    private taskEvents: TaskEvents;

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);
        this.fileTaskCaches = {};
    }

    async onload() {

        this.app.workspace.onLayoutReady(async () => {
            if (!this.initialized) {
                await this.loadSettings();
                this.taskFileManager = new TaskFileManager(this.app.vault, this.app.metadataCache, this.settings.taskDirectoryName)
                await this.processVault();
                this.taskEvents = new TaskEvents(this.app.workspace);
                await this.registerEvents();
                this.initialized = true;
            }
            if (!globals.initialized) {
                globals.app = this.app;
                globals.vault = this.app.vault;
                globals.fileManager = this.app.fileManager;
                globals.initialized = true;
            }
        });
    }

    onunload() {
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        // todo: trigger save event
    }

    registerEvents() {
        this.registerEvent(this.app.vault.on('create', this.handleFileCreated.bind(this)));
        // this.registerEvent(this.app.vault.on('modify', this.handleCacheChanged.bind(this)));
        this.registerEvent(this.app.vault.on('delete', this.handleFileDeleted.bind(this)));
        this.registerEvent(this.app.vault.on('rename', this.handleFileRenamed.bind(this)));
        this.registerEvent(this.app.metadataCache.on('changed', this.handleCacheChanged.bind(this)))

        this.registerEvent(this.app.workspace.on('file-open', file => {
            console.log('FILE-OPEN', file.path);
        }));

        // this.registerEvent(this.taskEvents.registerRequestIndexUpdateHandler(
        //     ({filePath, taskRecord}) => {
        //         this.index.handleIndexUpdateRequest(filePath, taskRecord);
        //     }));
        // this.registerEvent(this.taskEvents.registerRequestDeleteTaskHandler(this.index.handleIndexDeleteTaskRequest));
        // this.registerEvent(this.taskEvents.registerRequestDeleteFileHandler(
        //     ({filePath, taskRecord}) => {
        //         this.index.handleIndexDeleteFileRequest(filePath, taskRecord);
        //     }));

        // this.registerEvent(this.app.metadataCache.on('resolve', (arg) => {
        //     console.log('METADATA CACHE RESOLVE', arg.path);
        // }));
        // this.registerEvent(this.app.metadataCache.on('resolved', () => {
        //     console.log('METADATA CACHE RESOLVED_____');
        // }));
    }

    /**
     * If file is a task file, get the task, and add it to the index.
     *
     * @param abstractFile
     * @private
     */
    private async handleFileCreated(abstractFile: TAbstractFile) {
        // is it a task file?

        if (abstractFile instanceof TFile) {
            const contents = await this.app.vault.read(abstractFile);
            const fileMdCache = this.app.metadataCache.getFileCache(abstractFile);

            if (this.taskFileManager.isTaskFile(abstractFile)) {
                const task = await this.taskFileManager.getTaskFromTaskFile(abstractFile);
                if (!this.index.taskExists(task.id)) {
                    this.index.addTask(task);
                }
            }
            else {
                const taskCache = getFileTaskCache(fileMdCache, contents);
                const fp = abstractFile.path;
                if (
                    !(fp in this.fileTaskCaches) ||
                    await hashTaskCache(this.fileTaskCaches[fp]) !== await hashTaskCache(taskCache)
                ) {
                    this.fileTaskCaches[fp] = taskCache;
                    this.index.handleFileCacheUpdate(abstractFile, this.fileTaskCaches[fp] || {}, taskCache);
                }
            }
        }
    }

    /**
     * This will either be called with a task file or not. In the former, we simply grab the task metadata
     * and description, check index existence, and update the index.
     *
     * The latter is trickier. We gather the checklists from the file (anonymous tasks). We then need to compare names,
     * relationships, and locations.
     * @param abstractFile
     * @private
     */
    private async handleCacheChanged(abstractFile: TAbstractFile) {
        if (this.app.workspace.activeLeaf.view instanceof MarkdownView) {
            if (this.app.workspace.activeLeaf.view.file.path !== abstractFile.path) {
                // automated write from the file manager
                return;
            }
        }

        if (abstractFile instanceof TFile) {
            const existingCache = this.fileTaskCaches[abstractFile.path];
            const fileMetadataCache = this.app.metadataCache.getFileCache(abstractFile);

            if (this.taskFileManager.isTaskFile(abstractFile)) {
                const task = await this.taskFileManager.getTaskFromTaskFile(abstractFile);
                this.index.updateTask(task);
            }
            else {
                this.app.vault.read(abstractFile)
                    .then(async contents => {
                        const newTaskCache = getFileTaskCache(fileMetadataCache, contents);
                        const sha = await hashTaskCache(existingCache);
                        const newCacheSha = await hashTaskCache(newTaskCache);
                        if (sha !== newCacheSha) {
                            this.index.handleFileCacheUpdate(abstractFile, existingCache, newTaskCache);
                            this.fileTaskCaches[abstractFile.path] = newTaskCache;
                        } else {
                            // shas match...I don't think there's anything to do
                        }
                    });
            }
        }
    }

    private async handleFileDeleted(abstractFile: TAbstractFile) {
        if (abstractFile instanceof TFile) {
            if (this.taskFileManager.isTaskFile(abstractFile)) {
                const {id} = parseTaskFilename(abstractFile);
                this.index.deleteTask(Number.parseInt(id));
            } else {
                this.index.deleteFromFile(abstractFile.path);
                delete this.fileTaskCaches[abstractFile.path];
            }
        }
    }

    /**
     * if task file, we're renaming the task, and its presence in all parents & locations
     * if not a task file, we're only changing location references
     * @param abstractFile
     * @param oldPath
     * @private
     */
    private async handleFileRenamed(abstractFile: TAbstractFile, oldPath: string) {
        // mainly changing link data & locations
        if (abstractFile instanceof TFile) {
            const oldCache = this.fileTaskCaches[oldPath];
            const oldSha = await hashTaskCache(oldCache);
            const contents = await this.app.vault.read(abstractFile);
            const metadataCache = this.app.metadataCache.getFileCache(abstractFile);
            const newCache = getFileTaskCache(metadataCache, contents);
            const newSha = await hashTaskCache(newCache);
            // update filetaskcache
            delete this.fileTaskCaches[oldPath];
            this.fileTaskCaches[abstractFile.path] = newCache;
            // update index
            // do refs & locations need to be updated? yes
            // do we handle a task file differently? if we rely on the `name` field, then
            // it's all pointer/link/location updating
            if (this.taskFileManager.isTaskFile(abstractFile)) {
                // implies the task has been renamed
                // still a redundancy with the name yaml param
                const task = await this.taskFileManager.getTaskFromTaskFile(abstractFile);
                this.index.updateTask(task);
            }
            else {
                if (oldSha !== newSha) {
                    //
                }
                else {
                    // only update locations where this is the file path
                }
            }
        }
    }

    public get tasksDirectory(): TFolder | null {
        return this.app.vault.getAbstractFileByPath(this.settings.taskDirectoryName) as TFolder | null;
    }

    /**
     * Builds the index from the tasks directory.
     * @private
     */
    private async processTasksDirectory() {
        // todo: consider retry semantics
        if (!this.taskFileManager.tasksDirectory) {
            await this.app.vault.createFolder(this.settings.taskDirectoryName);
            const tasksFolder = this.app.vault.getAbstractFileByPath(this.settings.taskDirectoryName);
            this.taskFileManager.tasksDirectory = tasksFolder as TFolder;
        }
        const tasksFolder = this.taskFileManager.tasksDirectory;
        const tasks = [];
        const index = new TaskIndex();
        for (const tFile of tasksFolder.children) {
            tasks.push(this.taskFileManager.getTaskFromTaskFile(tFile as TFile));
        }
        return Promise.all(tasks)
            .then(all => {
                this.index = new TaskIndex(all);
            });
    }

    private async processVault() {
        await this.processTasksDirectory();
        for (const file of this.app.vault.getMarkdownFiles()) {
            if (file.path.includes(this.settings.taskDirectoryName))
                continue;
            await this.app.vault.read(file).then(async fileContents => {
                const fileCache = this.app.metadataCache.getFileCache(file);
                const taskCache = getFileTaskCache(fileCache, fileContents);
                this.fileTaskCaches[file.path] = taskCache;
                const taskRecord = fileTaskCacheToTaskList(file.path, taskCache);
                for (const line in taskRecord) {
                    const task = taskRecord[line];
                    if (!task.id || task.id === -1) {
                        throw new Error(`${task.name} has no id.`)
                    }
                    else {
                        if (!this.index.taskExists(task.id)) {
                            // bad
                            throw new Error(`Id ${task.id} assigned to ${task.name} but not in index.`)
                        }
                    }
                    if (!this.index.taskExists(task.id)) {
                        console.warn(`Task "${task.name}" in ${file.path} at ${line} not in index.`)
                    }
                    else {

                    }
                }
                for (const [line, task] of TaskParser.parseLines(fileContents)) {
                    const loc: TaskLocation = {filePath: file.path, position: line};
                    if (!this.index.taskExists(task.name)) {
                        // this is a problem
                        console.warn(`Task "${task.name}" in ${file.path} at ${line} not in index.`)
                        const iT = Task.fromAnonymousTask(task);
                        iT.locations = [...(iT.locations || []), loc];
                        this.index.addTask(iT);
                    } else {
                        // assume that other metadata is accurate from the tasks directory processing
                        const existing = this.index.getTaskByName(task.name);
                        existing.status = task.status;
                        // update locations
                        const foundLocI = existing.locations.findIndex(eLoc => isEqual(eLoc, loc));
                        if (foundLocI === -1)
                            existing.locations.push({filePath: file.path, position: line});
                    }
                }
            });
            // TODO: change to event trigger to update from file
        }
    }
}