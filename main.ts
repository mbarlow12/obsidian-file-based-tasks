import {
    App,
    CachedMetadata,
    debounce,
    Debouncer,
    EventRef,
    MarkdownView,
    Plugin,
    PluginManifest,
    TAbstractFile,
    TFile
} from 'obsidian';
import { TaskEvents } from "./src/Events/TaskEvents";
import { ActionType } from './src/Events/types';
import { TaskParser } from './src/Parser/TaskParser';
import { DEFAULT_TASK_MANAGER_SETTINGS } from './src/Settings';
import { filterIndexByPath } from './src/Store';
import { taskInstanceIdxFromTask, TaskStore } from "./src/Store/TaskStore";
import { TaskInstanceIndex, TaskStoreState } from './src/Store/types';
import { parseTaskFilename, TaskInstance, taskLocation } from "./src/Task";
import { taskIdToUid } from './src/Task/Task';
import { hashInstanceIndex, TaskFileManager } from "./src/TaskFileManager";
import { TaskManagerSettings } from "./src/taskManagerSettings";
import { TaskEditorSuggest } from './src/TaskSuggest';

export default class ObsidianTaskManager extends Plugin {
    settings: TaskManagerSettings;
    taskStore: TaskStore;
    taskFileManager: TaskFileManager;
    taskSuggest: TaskEditorSuggest;
    private instances: TaskInstance[];
    private state: Readonly<TaskStoreState>;
    private fileStates: Map<string, boolean>;
    private parser: TaskParser;
    private _activeFile: TFile;
    private vaultLoaded = false;
    private initialized = false;
    private taskEvents: TaskEvents;
    private changeDebouncers: Record<string, Debouncer<[]>>;
    private eventRefs: Record<string, EventRef> = {};
    private nextId = 100000;

    constructor( app: App, manifest: PluginManifest ) {
        super( app, manifest );
        this.changeDebouncers = {};
        this.eventRefs = {};
    }

    async onload() {

        this.app.workspace.onLayoutReady( async () => {
            if ( !this.initialized ) {
                this.taskEvents = new TaskEvents( this.app.workspace );
                this.taskStore = new TaskStore( this.taskEvents, this.settings );
                this.taskFileManager = new TaskFileManager( this.app.vault, this.app.metadataCache, this.taskEvents )
                this.parser = new TaskParser();
                await this.loadSettings();
                if ( !this.vaultLoaded )
                    await this.processVault();
                await this.registerEvents();
                // this.taskSuggest = new TaskEditorSuggest( app, this.taskEvents, this.taskStore.getState() );
                // this.registerEditorSuggest(this.taskSuggest);
                this.changeDebouncers = this.changeDebouncers || {};
                this.initialized = true;
            }
        } );
    }

    set activeFile( f: TFile ) {
        this._activeFile = f;
    }

    get activeFile() {
        return this._activeFile;
    }

    private isFileReady( file: TFile ) {
        if ( !this.fileStates.has( file.path ) )
            this.fileStates.set( file.path, false );
        return this.fileStates.get( file.path );
    }

    private setFileIsReady( file: TFile, ready: boolean ) {
        this.fileStates.set( file.path, ready );
    }

    onunload() {
        this.taskStore?.unload();
        this.taskSuggest?.unsubscribe();

        const proms = this.app.vault.getMarkdownFiles().filter( f => !this.ignorePath( f.path ) ).map( file => {
            return this.app.vault.read( file )
                .then( contents => {
                    const parser = new TaskParser( this.settings.parserSettings );
                    const taskItems = this.app.metadataCache.getFileCache( file )?.listItems
                        ?.filter( li => li.task ) || [];
                    const lines = contents.split( '\n' );
                    for ( const taskItem of taskItems ) {
                        let taskLine = lines[ taskItem.position.start.line ];
                        const task = parser.parseLine( taskLine );
                        if ( task ) {
                            // return line to normal
                            taskLine = taskLine.replace( TaskParser.ID_REGEX, '' )
                                .replace( parser.recurrenceRegex, '' )
                                .replace( parser.dueDateRegex, '' )
                                .trimEnd();
                            lines[ taskItem.position.start.line ] = taskLine;
                        }
                    }
                    const stripped = lines.join( '\n' );
                    return this.app.vault.modify( file, stripped );
                } )
                .then( () => {
                    console.log( `${file.path} successfully stripped.` );
                } );
        } );
        Promise.all( proms )
            .then( () => this.unload() );
    }

    async loadSettings() {
        this.settings = Object.assign( {}, DEFAULT_TASK_MANAGER_SETTINGS, await this.loadData() );
        this.taskEvents.triggerSettingsUpdate( this.settings );
        this.parser.updateSettings( this.settings.parserSettings );
    }

    async saveSettings() {
        await this.saveData( this.settings );
    }

    registerEvents() {
        this.registerEvent( this.app.vault.on( 'delete', this.handleFileDeleted.bind( this ) ) );
        this.registerEvent( this.app.vault.on( 'rename', this.handleFileRenamed.bind( this ) ) );
        this.registerEvent( this.app.metadataCache.on( 'changed', this.handleCacheChanged.bind( this ) ) );
        const resolvedRef = this.app.metadataCache.on( 'resolve', debounce( async () => {
            if ( !this.vaultLoaded ) {
                await this.processVault();
                this.vaultLoaded = true;
            }
            else {
                this.app.metadataCache.offref( resolvedRef );
            }
        }, 500, true ) );
        this.registerEvent( this.app.workspace.on( 'file-open', this.onOpenFile.bind( this ) ) );
    }

    private ignorePath( filePath: string ) {
        return this.settings.ignoredPaths.filter( ignored => filePath.includes( ignored ) ).length > 0;
    }

    private async onOpenFile( file: TFile ) {
        if ( !file || this.ignorePath( file.path ) )
            return;

        const { instanceIndex, taskIndex } = this.taskStore.getState();
        const fileIndex = await this.taskFileManager.getInstanceIndexFromFile(
            file,
            this.app.metadataCache.getFileCache( file ),
            await this.app.vault.cachedRead( file )
        );
        const hash = hashInstanceIndex( fileIndex );
        let storedIndex = filterIndexByPath( file.path, instanceIndex );
        let taskUid: number;
        if ( this.taskFileManager.isTaskFile( file ) ) {
            const { id } = parseTaskFilename( file );
            taskUid = taskIdToUid( id );
            const storedTask = taskIndex.get( taskUid );
            storedIndex = taskInstanceIdxFromTask( storedTask );
        }

        const storedHash = hashInstanceIndex( storedIndex );
        if ( storedHash !== hash ) {
            this.setFileIsReady( file, false );
            if ( this.settings.indexFiles.has( file.path ) )
                await this.taskFileManager.writeIndexFile( file, instanceIndex, taskIndex );
            else if ( this.taskFileManager.isTaskFile( file ) )
                await this.taskFileManager.storeTaskFile( taskIndex.get( taskUid ) )
            else
                await this.taskFileManager.writeStateToFile( file, storedIndex );
        }
        else
            this.setFileIsReady( file, true );
    }

    private async handleCacheChanged( file: TFile, data: string, cache: CachedMetadata ) {

        if ( this.app.workspace.getActiveViewOfType<MarkdownView>( MarkdownView ) ) {
            if ( this.app.workspace.getActiveViewOfType( MarkdownView ).file.path !== file.path ) {
                // automated write from the file manager, don't trigger update
                return;
            }
        }

        if ( this.ignorePath( file.path ) )
            return

        if ( !this.isFileReady( file ) ) {
            this.setFileIsReady( file, true );
            return;
        }

        const { line } = this.app.workspace.getActiveViewOfType( MarkdownView ).editor.getCursor();
        const fileInstances = await this.taskFileManager.getInstanceIndexFromFile( file, cache, data );
        const cursorInst = fileInstances.get( taskLocation( file.path, line ) );
        if ( cursorInst && cursorInst.uid === 0 )
            fileInstances.delete( taskLocation( file.path, line ) );
        const existingFileInstances = filterIndexByPath( file.path, this.taskStore.getState().instanceIndex );
        if ( hashInstanceIndex( fileInstances ) !== hashInstanceIndex( existingFileInstances ) ) {
            if ( !(file.path in this.changeDebouncers) )
                this.changeDebouncers[ file.path ] = debounce( () => {
                    const insts = this.taskStore.replaceFileInstances( fileInstances )
                    this.taskStore.buildStateFromInstances( insts );
                    this.state = this.taskStore.getState();
                }, 250, true );
            this.changeDebouncers[ file.path ]();
        }
    }

    private async handleFileDeleted( abstractFile: TAbstractFile ) {
        if ( abstractFile instanceof TFile ) {
            if ( this.fileStates.has( abstractFile.path ) ) {
                this.taskStore.deleteTasksFromFile( abstractFile );
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
    private async handleFileRenamed( abstractFile: TAbstractFile, oldPath: string ) {
        this.taskEvents.triggerFileCacheUpdate( {
            type: ActionType.RENAME_FILE,
            data: { oldPath, newPath: abstractFile.path }
        } )
    }

    private async processVault() {
        if ( this.vaultLoaded ) return;
        let taskInstances: TaskInstanceIndex = new Map();
        for ( const file of this.app.vault.getMarkdownFiles() ) {
            if ( file.path.includes( this.settings.taskDirectoryName ) || this.ignorePath( file.path ) )
                continue;
            const contents = await this.app.vault.read( file );
            const cache = this.app.metadataCache.getFileCache( file );
            const fileTaskInstances = this.taskFileManager.getFileInstances( file, cache, contents );
            taskInstances = new Map( [ ...taskInstances, ...fileTaskInstances ] );
        }
        this.taskStore.initialize( taskInstances )
        this.vaultLoaded = true;
    }
}
