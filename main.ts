import { values } from 'lodash';
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
import { ActionType, IndexUpdateAction } from './src/Events/types';
import { TaskParser } from './src/Parser/TaskParser';
import { DEFAULT_TASK_MANAGER_SETTINGS } from './src/Settings';
import { taskInstancesFromTask, TaskStore } from "./src/Store/TaskStore";
import { TaskIndex, TaskInstanceIndex } from './src/Store/types';
import { TaskInstance, taskLocationStr } from "./src/Task";
import { taskIdToUid } from './src/Task/Task';
import { CacheStatus, filterIndexByPath, hashInstanceList, TaskFileManager } from "./src/TaskFileManager";
import { TaskManagerSettings } from "./src/taskManagerSettings";
import { TaskEditorSuggest } from './src/TaskSuggest';

type TaskState = {
    readonly taskIndex: TaskIndex;
    readonly taskInstanceIndex: TaskInstanceIndex;
}

export default class ObsidianTaskManager extends Plugin {
    settings: TaskManagerSettings;
    taskStore: TaskStore;
    taskFileManager: TaskFileManager;
    taskSuggest: TaskEditorSuggest;
    private instances: TaskInstance[];
    private state: TaskState;
    private fileStates: Map<string, boolean>;
    private parser: TaskParser;
    private _activeFile: TFile;
    private vaultLoaded = false;
    private initialized = false;
    private taskEvents: TaskEvents;
    private changeDebouncers: Record<string, Debouncer<[ IndexUpdateAction ]>>;
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

    private setFileReady( file: TFile, ready: boolean ) {
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
        let storedIndex: TaskInstanceIndex;
        if ( this.taskFileManager.isTaskFile( file ) ) {
            const storedTask = taskIndex[ taskIdToUid( file.basename.split( '_' )[ 1 ] ) ];
            storedIndex = taskInstancesFromTask( storedTask ).reduce( ( idx, i ) => ({
                ...idx,
                [ taskLocationStr( i ) ]: i
            }), {} );
        }
        else
            storedIndex = filterIndexByPath( file.path, instanceIndex );
        const fileIndex = await this.taskFileManager.getInstanceIndexFromFile( file );
        const hash = hashInstanceList( fileIndex );
        const storedHash = hashInstanceList( storedIndex );

        if ( storedHash !== hash ) {
            this.setFileReady( file, false );
            if ( this.settings.indexFiles.has( file.path ) )
                await this.taskFileManager.writeIndexFile( file, instanceIndex, taskIndex );
            else if ( this.taskFileManager.isTaskFile( file ) )
                await this.taskFileManager.storeTaskFile( taskIndex[ values( storedIndex )[ 0 ].uid ] )
            else
                await this.taskFileManager.writeStateToFile( file, { instanceIndex: storedIndex, taskIndex } );
        }
        else
            this.taskFileManager.setFileStateHash( file.path, { status: CacheStatus.CLEAN, hash: storedHash } );
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
            this.setFileReady( file, true );
            return;
        }

        const { line } = this.app.workspace.getActiveViewOfType( MarkdownView ).editor.getCursor();
        const fileInstances = await this.taskFileManager.getInstanceIndexFromFile( file, cache, data );
        const iCursor = fileInstances.findIndex( inst => inst.filePath === file.path && inst.position.start.line === line );
        if ( iCursor !== -1 && !fileInstances[ iCursor ].uid )
            fileInstances.splice( iCursor, 1 );
        const existingFileInstances = this.instances.filter( inst => inst.filePath === file.path );
        if ( hashInstanceList( fileInstances ) !== hashInstanceList( existingFileInstances ) ) {
            if ( !(file.path in this.changeDebouncers) )
                this.changeDebouncers[ file.path ] = debounce(
                    this.taskEvents.triggerFileCacheUpdate.bind( this.taskEvents ),
                    250,
                    true
                );
            this.changeDebouncers[ file.path ]( { type: ActionType.MODIFY_FILE_TASKS, data: fileInstances } );
        }
    }

    private async handleFileDeleted( abstractFile: TAbstractFile ) {
        if ( abstractFile instanceof TFile ) {
            if ( this.taskFileManager.getFileStateHash( abstractFile.path ) )
                this.taskEvents.triggerFileCacheUpdate( { type: ActionType.DELETE_FILE, data: abstractFile.path } )
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
            this.taskEvents.triggerFileCacheUpdate( {
                type: ActionType.RENAME_FILE,
                data: { oldPath, newPath: abstractFile.path }
            } )
        }
    }


    private getStateFromInstances(): TaskState {
        [].find()
        this.instances.forEach(() => {});
        return {
            taskInstanceIndex: {},
            taskIndex: {}
        }
    }

    private async processVault() {
        if ( this.vaultLoaded ) return;
        let taskInstances: TaskInstance[] = [];
        for ( const file of this.app.vault.getMarkdownFiles() ) {
            if ( file.path.includes( this.settings.taskDirectoryName ) || this.ignorePath( file.path ) )
                continue;
            const contents = await this.app.vault.read( file );
            const cache = this.app.metadataCache.getFileCache( file );
            const fileTaskInstances = this.taskFileManager.getFileInstances( file, cache, contents );
            taskInstances = [
                ...taskInstances,
                ...fileTaskInstances
            ];
        }
        this.taskStore.initialize( taskInstances )
        this.vaultLoaded = true;
    }
}
