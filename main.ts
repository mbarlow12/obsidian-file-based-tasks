import {App, MarkdownView, Plugin, PluginManifest, TAbstractFile, TFile, TFolder} from 'obsidian';
import {TaskIndex} from "./src/TaskIndex";
import {ITask, parseTaskFilename} from "./src/Task";
import {TaskFileManager} from "./src/TaskFileManager";
import {TaskEvents} from "./src/Events/TaskEvents";
import {isEmpty} from "lodash";

const DEFAULT_SETTINGS: TaskManagerSettings = {
    taskDirectoryName: 'tasks',
    backlogFileName: 'BACKLOG',
    completedFileName: 'COMPLETE',
}

export default class ObsidianTaskManager extends Plugin {
    settings: TaskManagerSettings;
    index: TaskIndex;
    taskFileManager: TaskFileManager;
    private vaultLoaded: boolean = false;
    private initialized = false;
    private taskEvents: TaskEvents;

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);
    }

    async onload() {

        this.app.workspace.onLayoutReady(async () => {
            if (!this.initialized) {
                await this.loadSettings();
                this.taskFileManager = new TaskFileManager(this.app.vault, this.app.metadataCache, this.settings.taskDirectoryName)
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
    }

    registerEvents() {
        this.registerEvent(this.app.vault.on('delete', this.handleFileDeleted.bind(this)));
        this.registerEvent(this.app.vault.on('rename', this.handleFileRenamed.bind(this)));
        this.registerEvent(this.app.metadataCache.on('changed', this.handleCacheChanged.bind(this)))
        const resolvedRef = this.app.metadataCache.on('resolved', async () => {
            if (!this.vaultLoaded) {
                await this.processVault();
                this.vaultLoaded = true;
            } else {
                this.app.metadataCache.offref(resolvedRef);
            }
        });
    }

    // private async handleFileCreated(abstractFile: TAbstractFile) {
    //     if (abstractFile instanceof TFile) {
    //         if (this.taskFileManager.isTaskFile(abstractFile)) {
    //             const task = await this.taskFileManager.readTaskFile(abstractFile);
    //             if (!this.index.taskExists(task.id)) {
    //                 this.index.addTask(task);
    //             }
    //         } else {
    //             const record = await this.taskFileManager.readNoteFile(abstractFile);
    //             if (!isEmpty(record)) {
    //                 const {dirtyTasks} = await this.index.updateFromFile(abstractFile.path, record);
    //                 await this.handleIndexUpdateResults(dirtyTasks, {});
    //             }
    //         }
    //     }
    // }

    private async handleCacheChanged(abstractFile: TAbstractFile) {
        if (this.app.workspace.activeLeaf.view instanceof MarkdownView) {
            if (this.app.workspace.activeLeaf.view.file.path !== abstractFile.path) {
                // automated write from the file manager
                return;
            }
        }

        if (abstractFile instanceof TFile) {
            if (this.taskFileManager.isTaskFile(abstractFile)) {
                const task = await this.taskFileManager.readTaskFile(abstractFile);
                this.index.updateTask(task);
                const {dirtyTasks, deletedTasks} = await this.index.updateIndex();
                await this.handleIndexUpdateResults(dirtyTasks, deletedTasks);
            } else {
                const record = await this.taskFileManager.readNoteFile(abstractFile);
                if (isEmpty(record))
                    return;
                const view = this.app.workspace.activeLeaf.view as MarkdownView;
                const cursor = view.editor.getCursor();
                for (const line in record) {
                    if (Number.parseInt(line) === cursor.line)
                        return;
                }
                const {dirtyTasks, deletedTasks} = await this.index.updateFromFile(abstractFile.path, record);
                await this.handleIndexUpdateResults(dirtyTasks, deletedTasks);
            }
        }
    }

    private async handleFileDeleted(abstractFile: TAbstractFile) {
        if (abstractFile instanceof TFile) {
            if (this.taskFileManager.isTaskFile(abstractFile)) {
                const {name, id} = parseTaskFilename(abstractFile);
                const task = this.index.getTaskById(Number.parseInt(id));
                if (task.name === name)
                    this.index.deleteTask(Number.parseInt(id));
            } else {
                this.index.deleteAllFileLocations(abstractFile.path);
                this.taskFileManager.deleteFile(abstractFile);
            }
            const {dirtyTasks, deletedTasks} = await this.index.updateIndex();
            await this.handleIndexUpdateResults(dirtyTasks, deletedTasks);
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
            if (this.taskFileManager.isTaskFile(abstractFile)) {
                // implies the task has been renamed
                const task = await this.taskFileManager.readTaskFile(abstractFile);
                const {name, id} = parseTaskFilename(abstractFile);
                task.id = Number.parseInt(id);
                task.name = name;
                this.index.updateTask(task);
                const {dirtyTasks, deletedTasks} = await this.index.updateIndex()
                await this.handleIndexUpdateResults(dirtyTasks, deletedTasks);
            } else {
                this.index.deleteAllFileLocations(oldPath);
                const record = await this.taskFileManager.readNoteFile(abstractFile);
                const {dirtyTasks, deletedTasks} = await this.index.updateFromFile(abstractFile.path, record);
                await this.handleIndexUpdateResults(dirtyTasks, deletedTasks);
            }
        }
    }

    public async handleIndexUpdateResults(dirtyTasks: Record<number, ITask>, deletedTasks: Record<number, ITask>) {
        if (Object.keys(dirtyTasks).length)
            await this.taskFileManager.storeTasks(this.index)
        if (Object.keys(deletedTasks).length)
            await this.taskFileManager.deleteTasks(deletedTasks);

        for (const file of this.taskFileManager.tasksDirectory.children) {
            const {name, id} = parseTaskFilename(file as TFile);
            if (!this.index.taskExists(name) || !this.index.taskExists(Number.parseInt(id)))
                await this.app.vault.delete(file);
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
        if (!this.taskFileManager.tasksDirectory) {
            await this.app.vault.createFolder(this.settings.taskDirectoryName);
            const tasksFolder = this.app.vault.getAbstractFileByPath(this.settings.taskDirectoryName);
            this.taskFileManager.tasksDirectory = tasksFolder as TFolder;
        }
        const tasksFolder = this.taskFileManager.tasksDirectory;
        const tasks = [];
        for (const tFile of tasksFolder.children) {
            tasks.push(this.taskFileManager.readTaskFile(tFile as TFile));
        }
        return Promise.all(tasks)
            .then(all => {
                this.index = new TaskIndex(all);
            });
    }

    private async processVault() {
        await this.processTasksDirectory();
        let updateTasks: Record<number, ITask> = {};
        let deleteTasks: Record<number, ITask> = {};
        for (const file of this.app.vault.getMarkdownFiles()) {
            if (file.path.includes(this.settings.taskDirectoryName))
                continue;
            const record = await this.taskFileManager.readNoteFile(file);
            const {dirtyTasks, deletedTasks} = await this.index.updateFromFile(file.path, record);
            updateTasks = {
                ...updateTasks,
                ...dirtyTasks
            };
            deleteTasks = {
                ...deleteTasks,
                ...deletedTasks
            };
        }
        await this.taskFileManager.deleteTasks(deleteTasks);
        await this.taskFileManager.storeTasks(this.index);
    }
}