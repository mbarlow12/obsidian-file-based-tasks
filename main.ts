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
import TaskParser from "./src/TaskParser";
import {FileTaskLine, IAnonymousTask, ITask, Task, TaskLocation} from "./src/Task";
import {TaskFileManager} from "./src/TaskFileManager";
import {entries, intersection, isEqual} from 'lodash';
import {TaskEvents} from "./src/Events/TaskEvents";
import {FileTaskCache} from "./src/File/types";
import {getFileTaskCache} from "./src/File";

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

        this.registerEvent(
            this.taskEvents.registerRequestIndexUpdateHandler(
                ({filePath, taskRecord}) => {
                    this.index.handleIndexUpdateRequest(filePath, taskRecord);
                }
            ));

        this.registerEvent(this.app.metadataCache.on('resolve', (arg) => {
            console.log('METADATA CACHE RESOLVE', arg.path);
        }));
        this.registerEvent(this.app.metadataCache.on('resolved', () => {
            console.log('METADATA CACHE RESOLVED_____');
        }));
    }

    private handleFileCreated(abstractFile: TAbstractFile) {
        console.log('FILE CREATED', abstractFile.path);
        // parse file
        // is it a task file?
        // yes? -> compare data to index, update if diff from most recent updated value
        // no? -> parse file, create anon todos if necessary
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
    private handleCacheChanged(abstractFile: TAbstractFile) {
        if (this.app.workspace.activeLeaf.view instanceof MarkdownView) {
            if (this.app.workspace.activeLeaf.view.file.path !== abstractFile.path) {
                // automated write from the file manager
                return;
            }
        }

        if (abstractFile instanceof TFile) {
            const fileTaskCache = this.fileTaskCaches[abstractFile.path];
            const fileMetadataCache = this.app.metadataCache.getFileCache(abstractFile);
            this.app.vault.read(abstractFile)
                .then(contents => getFileTaskCache(fileMetadataCache, contents))
                .then(newTaskCache => {
                    this.taskFileManager.parseTasksFromFile(abstractFile)
                        .then(tasksData => {
                            const [t, rec] = tasksData;
                            const tasks: ITask[] = []
                            if (t)
                                tasks.push(Task.fromITask(t));
                            else if (rec) {
                                const keys = Object.keys(rec);
                                for (let i = 0; i < keys.length; i++) {
                                    const anonTask = rec[Number.parseInt(keys[i])];
                                    const task = new Task(anonTask.name, anonTask.status);
                                    task.addLocation({filePath: abstractFile.path, line: i});
                                    tasks.push(task);
                                }
                            }

                            if (tasks.length) {
                                this.taskEvents.triggerRequestIndexUpdate(abstractFile.path, tasks);
                            }
                        });
                })
        }
    }

    private handleFileDeleted(abstractFile: TAbstractFile) {

    }

    private handleFileRenamed(abstractFile: TAbstractFile) {

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
            tasks.push(this.taskFileManager.getTaskFromTaskFile(tFile as TFile, index));
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
            await this.app.vault.read(file).then(fileContents => {
                const fileCache = this.app.metadataCache.getFileCache(file);
                this.fileTaskCaches[file.path] = getFileTaskCache(fileCache, fileContents);
                for (const [line, task] of TaskParser.parseLines(fileContents)) {
                    const loc: TaskLocation = {filePath: file.path, line};
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
                            existing.locations.push({filePath: file.path, line});
                    }
                }
            });
            // TODO: change to event trigger to update from file
        }
    }
}