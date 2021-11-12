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
import globals from "./src/globals";
import {FileTaskLine} from "./src/Task";
import {TaskFileManager} from "./src/TaskFileManager";

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

        this.app.workspace.onLayoutReady(() => {
            if (!this.initialized) {
                this.loadSettings()
                    .then(() => {
                        this.taskFileManager = new TaskFileManager(this.app.vault, this.app.metadataCache, this.settings.taskDirectoryName)
                        this.processTasksDirectory()
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

    }

    private handleFileModified(abstractFile: TAbstractFile) {

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
        const witnessedNames: Set<string> = new Set();
        for (const tFile of tasksFolder.children) {
            const existing = this.index.getTaskByName(tFile.name);
            if (existing) {
                // what to do here?
                // we should not have dupliates
            }
            const task = await this.taskFileManager.getTaskFromTaskFile(tFile as TFile, witnessedNames)
            this.index.addTask(task);
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