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
import {entries, intersection} from 'lodash';
import {TaskEvents} from "./src/Events/TaskEvents";

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
                await this.processTasksDirectory();
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
        this.registerEvent(this.app.vault.on('modify', this.handleFileModified.bind(this)));
        this.registerEvent(this.app.vault.on('delete', this.handleFileDeleted.bind(this)));
        this.registerEvent(this.app.vault.on('rename', this.handleFileRenamed.bind(this)));

        this.registerEvent(this.app.workspace.on('file-open', file => {
            console.log('FILE-OPEN', file.path);
        }));

        this.registerEvent(this.taskEvents.registerRequestIndexUpdateHandler(({filePath, taskRecord}) => {
            this.index.handleIndexUpdateRequest(filePath, taskRecord);
        }));

        this.registerEvent(this.app.metadataCache.on('changed', (arg) => {
            console.log('METADATA CACHE CHANGED', arg.path);
        }));
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
    private handleFileModified(abstractFile: TAbstractFile) {
        if (this.app.workspace.activeLeaf.view instanceof MarkdownView) {
            if (this.app.workspace.activeLeaf.view.file.path !== abstractFile.path) {
                // automated write from the file manager
                return;
            }
        }

        if (abstractFile instanceof TFile) {
            this.taskFileManager.parseTasksFromFile(abstractFile)
                .then(tasksData => {
                    const [t, rec] = tasksData;
                    const tasks: ITask[] = []
                    if (t)
                        tasks.push(Task.fromITask(t));
                    else if (rec) {
                        const keys = Object.keys(rec);
                        for (let i = 0; i < keys.length; i++) {
                            const anonTask = rec[i];
                            const task = new Task(anonTask.name, anonTask.status);
                            task.addLocation({filePath: abstractFile.path, line: i});
                            tasks.push(task);
                        }
                    }

                    if (tasks.length)
                        this.taskEvents.triggerRequestIndexUpdate(abstractFile.path, tasks);
                });
        }
    }

    private handleFileDeleted(abstractFile: TAbstractFile) {

    }

    private handleFileRenamed(abstractFile: TAbstractFile) {

    }

    private indexTodosFromFile(tFile: TFile) {
        this.app.vault.cachedRead(tFile)
            .then(TaskParser.parseLines)
            .then(taskLines => this.processFileTasks(taskLines, tFile))
            .catch(console.log);
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
        Promise.all(tasks)
            .then(all => {
                this.index = new TaskIndex(all);
            });
    }

    private async processVault() {
        await this.processTasksDirectory();
        for (const file of this.app.vault.getMarkdownFiles().filter(f => !f.path.includes(this.settings.taskDirectoryName))) {
            const fileRecord = await this.taskFileManager.getTasksFromFile(file);
            const newTasks: ITask[] = [];
            for (let lineNumber in fileRecord) {
                const anonTask = fileRecord[Number.parseInt(lineNumber)];
                newTasks.push(Task.fromAnonymousTask(anonTask));
            }
            if (newTasks.length > 0) {
                this.taskEvents.triggerRequestIndexUpdate(file.path, newTasks);
            }
        }
    }

    private buildTaskIndex() {
        const index = new TaskIndex();
        const vault = this.app.vault;
        const cache = this.app.metadataCache;
        const files = vault.getMarkdownFiles();
        for (const tFile of files) {
            vault.cachedRead(tFile)
                .then(contents => {
                    const {frontmatter, listItems} = cache.getFileCache(tFile);
                })
        }
    }

    /**
     *
     * @param bTasks
     * @param tFile
     * @private
     */
    private processFileTasks(bTasks: FileTaskLine[], tFile: TFile) {
        for (const [lineNo, {name, status}] of bTasks) {
            const primaryTask = this.index.getTaskByName(name);
            if (!primaryTask) {
                // create new task
            } else {
                // add location to task
            }
        }
    }
}

function handlKeyup(event: KeyboardEvent) {
    console.log('keyupping!');
}

/*
class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		let {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		let {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: TaskManagerPlugin;

	constructor(app: App, plugin: TaskManagerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		let {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Settings for my awesome plugin.'});

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue('')
				.onChange(async (value) => {
					console.log('Secret: ' + value);
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}*/