import { values } from 'lodash';
import { App, debounce, MarkdownView, Plugin, PluginManifest, TAbstractFile, TFile, TFolder } from 'obsidian';
import { TaskEvents } from "./src/Events/TaskEvents";
import { ActionType } from './src/Events/types';
import { taskInstancesFromTask, TaskStore } from "./src/Store/TaskStore";
import { TaskInstance } from "./src/Task";
import { CacheStatus, TaskFileManager } from "./src/TaskFileManager";
import { TaskManagerSettings } from "./src/taskManagerSettings";
import { TaskEditorSuggest } from './src/TaskSuggest';

const DEFAULT_SETTINGS: TaskManagerSettings = {
    taskDirectoryName: 'tasks',
    backlogFileName: 'BACKLOG',
    completedFileName: 'COMPLETE',
    taskPrefix: '#task'
}

export default class ObsidianTaskManager extends Plugin {
    settings: TaskManagerSettings;
    taskStore: TaskStore;
    taskFileManager: TaskFileManager;
    private vaultLoaded = false;
    private initialized = false;
    private taskEvents: TaskEvents;
    private cursorTask: TaskInstance;
    taskSuggesster: TaskEditorSuggest;

    constructor( app: App, manifest: PluginManifest ) {
        super( app, manifest );
    }

    async onload() {

        this.app.workspace.onLayoutReady( async () => {
            if ( !this.initialized ) {
                await this.loadSettings();
                this.taskEvents = new TaskEvents( this.app.workspace );
                this.taskStore = new TaskStore( this.taskEvents );
                this.taskFileManager =
                    new TaskFileManager( this.app.vault, this.app.metadataCache, this.taskEvents, this.settings.taskDirectoryName, this.settings.backlogFileName )
                await this.registerEvents();
                await this.processVault()
                // this.registerEditorSuggest(new TaskEditorSuggest(this.app, this.index))
                this.initialized = true;
                this.taskSuggesster = new TaskEditorSuggest(app, this.taskEvents, this.taskStore.getState());
                this.registerEditorSuggest(this.taskSuggesster)
            }
        } );
    }

    onunload() {
        this.taskStore?.unload();
        this.taskSuggesster?.unsubscribe();
    }

    async loadSettings() {
        this.settings = Object.assign( {}, DEFAULT_SETTINGS, await this.loadData() );
    }

    async saveSettings() {
        await this.saveData( this.settings );
    }

    registerEvents() {
        this.registerEvent( this.app.vault.on( 'delete', this.handleFileDeleted.bind( this ) ) );
        this.registerEvent( this.app.vault.on( 'rename', this.handleFileRenamed.bind( this ) ) );
        const debouncedChange = debounce( this.handleCacheChanged.bind( this ), 2500, true )
        this.registerEvent( this.app.metadataCache.on( 'changed', debouncedChange ) )
        const resolvedRef = this.app.metadataCache.on( 'resolve', async () => {
            if ( !this.vaultLoaded ) {
                await this.processVault();
                this.vaultLoaded = true;
            }
            else {
                this.app.metadataCache.offref( resolvedRef );
            }
        } );
    }

    private async handleCacheChanged( abstractFile: TAbstractFile ) {
        if ( !this.taskFileManager.testAndSetFileStatus( abstractFile.path, CacheStatus.DIRTY ) ) {
            return;
        }

        if ( this.app.workspace.activeLeaf.view instanceof MarkdownView ) {
            if ( this.app.workspace.activeLeaf.view.file.path !== abstractFile.path ) {
                // automated write from the file manager
                return;
            }
        }

        if ( abstractFile instanceof TFile ) {
            const state = await this.taskFileManager.getFileTaskState( abstractFile );
            if ( state !== null )
                this.taskEvents.triggerFileCacheUpdate( {type: ActionType.MODIFY_FILE_TASKS, data: state});
        }
    }

    private async handleFileDeleted( abstractFile: TAbstractFile ) {
        if ( abstractFile instanceof TFile ) {
            if ( this.taskFileManager.getFileStateHash( abstractFile.path ) )
                this.taskEvents.triggerFileCacheUpdate( { type: ActionType.DELETE_FILE, data: abstractFile.path})
        }
    }

    /**
     * if task file, we're renaming the task, and its presence in all parents & locations
     * if not a task file, we're only changing location references
     * @param abstractFile
     * @param oldPath
     * @private
     */
    private async handleFileRenamed( abstractFile: TAbstractFile, oldPath: string ) {
        if ( this.taskFileManager.getFileStateHash( oldPath ) ) {
            this.taskEvents.triggerFileCacheUpdate( {type: ActionType.RENAME_FILE, data: { oldPath, newPath: abstractFile.path}} )
        }
    }

    public get tasksDirectory(): TFolder | null {
        return this.app.vault.getAbstractFileByPath( this.settings.taskDirectoryName ) as TFolder | null;
    }

    /**
     * Builds the index from the tasks directory.
     * @private
     */
    private async processTasksDirectory() {
        if ( !this.taskFileManager.tasksDirectory ) {
            await this.app.vault.createFolder( this.settings.taskDirectoryName );
            const tasksFolder = this.app.vault.getAbstractFileByPath( this.settings.taskDirectoryName );
            this.taskFileManager.tasksDirectory = tasksFolder as TFolder;
        }
        const tasksFolder = this.taskFileManager.tasksDirectory;
        const tasks = [];
        for ( const tFile of tasksFolder.children ) {
            tasks.push( this.taskFileManager.readTaskFile( tFile as TFile ) );
        }
        return Promise.all( tasks )
            .then( allTasks =>
                allTasks.reduce( (
                    st,
                    idxTask
                ) => [...st, ...taskInstancesFromTask(idxTask)], [] as TaskInstance[] )
            );
    }

    private async processVault() {
        if ( this.vaultLoaded ) return;
        const taskInstances = await this.processTasksDirectory();
        let fileTaskInstances: TaskInstance[] = [];
        for ( const file of this.app.vault.getMarkdownFiles() ) {
            if ( file.path.includes( this.settings.taskDirectoryName ) )
                continue;
            const fileInstanceIdx = await this.taskFileManager.readMarkdownFile( file );
            fileTaskInstances = [
                ...fileTaskInstances,
                ...values(fileInstanceIdx)
            ];
        }
        this.taskStore.initialize([...taskInstances, ...fileTaskInstances])
        this.vaultLoaded = true;
    }
}
