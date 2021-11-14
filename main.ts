import {
    App,
    debounce,
    FileManager,
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
import {FileTaskLine, IAnonymousTask, Task, TaskLocation} from "./src/Task";
import {TaskFileManager} from "./src/TaskFileManager";
import {entries, intersection} from 'lodash';

const DEFAULT_SETTINGS: TaskManagerSettings = {
    taskDirectoryName: 'tasks',
    indexFile: 'taskIndex.txt',
    backlogFileName: 'backlog',
    completedFileName: 'completed',
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

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);
    }

    async onload() {

        this.app.workspace.onLayoutReady(async () => {
            if (!this.initialized) {
                await this.loadSettings();
                await this.processTasksDirectory();
                await this.registerEvents();
                this.loadSettings()
                    .then(() => {
                        this.taskFileManager = new TaskFileManager(this.app.vault, this.app.metadataCache, this.settings.taskDirectoryName)
                        this.processTasksDirectory().then(() => {
                            this.registerEvents();
                        })
                    });
            }
        });

        // get task directory

        // this.registerDomEvent(document, 'keyup', debounce(handlKeyup, 300, true));

        // set some code to run on interval, may be good for backing the data up
        // this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
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
        [
            this.app.vault.on('create', this.handleFileCreated),
            this.app.vault.on('modify', this.handleFileModified),
            this.app.vault.on('delete', this.handleFileDeleted),
            this.app.vault.on('rename', this.handleFileRenamed),
        ].forEach(this.registerEvent);
    }

    private handleFileCreated(abstractFile: TAbstractFile) {
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
        // same as created
        this.taskFileManager.parseTasksFromFile(abstractFile as TFile, this.index)
            .then(([task, record]) => {
                if (task) {

                }
                if (record) {
                    // iterate over the records, and only add new or changed ones
                    // after we have everything, we can check if the index currently thinks a task
                    // should be in this file, indicating a deletion
                    const newTasks: Task[] = [];
                    const updateTasks: Task[] = [];
                    for (let [numStr, anonTask] of entries(record)) {
                        const lineNumber = Number.parseInt(numStr);
                        if (this.index.taskExists(anonTask.name)) {
                            // is anything different?
                            const anonLoc: TaskLocation = {
                                filePath: abstractFile.path,
                                line: lineNumber
                            };
                            const task = this.index.getTaskByName(anonTask.name) as Task;
                            const getName = (arg: IAnonymousTask) => arg.name;
                            let diff = task.status !== anonTask.status ||
                                !task.hasLocation(anonLoc) ||
                                intersection(task.children.map(getName), anonTask.children.map(getName)).length > 0 ||
                                intersection(task.parents.map(getName), anonTask.parents.map(getName)).length > 0;

                            // may have removed a location
                            const currentTasksInFile = this.index.getTasksByFilename(abstractFile.name);

                            if (diff) {
                                // trigger update event
                            }
                            else {
                                // do we do anything?
                            }

                        }
                        else {
                            const task = new Task(anonTask.name, anonTask.status);
                            task.locations = [{filePath: abstractFile.path, line: lineNumber}];
                            for (let child of (anonTask.children || [])) {
                                task.addChild(new Task(child.name, child.status));
                            }
                            for (let p of (anonTask.parents || [])) {
                                task.addParent(new Task(p.name, p.status));
                            }
                            newTasks.push(task);
                        }
                    }

                    if (newTasks.length > 0) {

                    }
                }
            });
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