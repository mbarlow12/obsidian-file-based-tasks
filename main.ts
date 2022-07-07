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
import { hashInstanceIndex, TaskFileManager } from "./src/File/TaskFileManager";
import { TaskParser } from './src/Parser/TaskParser';
import { DEFAULT_TASK_MANAGER_SETTINGS } from './src/Settings';
import { filterIndexByPath, getFileIndexes } from './src/Store';
import { taskInstanceIdxFromTask, TaskStore } from "./src/Store/TaskStore";
import { TaskInstanceIndex, TaskStoreState } from './src/Store/types';
import { hashTask, instanceIndexKey, parseTaskFilename } from "./src/Task";
import { taskIdToUid } from './src/Task/Task';
import { TaskManagerSettings } from "./src/taskManagerSettings";
import { TaskEditorSuggest } from './src/TaskSuggest';

export default class ObsidianTaskManager extends Plugin {
    settings: TaskManagerSettings;
    taskStore: TaskStore;
    taskFileManager: TaskFileManager;
    taskSuggest: TaskEditorSuggest;
    private state: Readonly<TaskStoreState>;
    private fileStates: Map<string, { hash: string, ready: boolean }>;
    private parser: TaskParser;
    private _activeFile: TFile;
    private vaultLoaded = false;
    private initialized = false;
    private taskEvents: TaskEvents;
    private changeDebouncers: Map<string, Debouncer<[ TFile, string, CachedMetadata ]>>;
    private eventRefs: Record<string, EventRef> = {};

    constructor( app: App, manifest: PluginManifest ) {
        super( app, manifest );
        this.changeDebouncers = new Map();
        this.eventRefs = {};
        this.fileStates = new Map();
    }

    async onload() {

        this.app.workspace.onLayoutReady( async () => {
            if ( !this.initialized ) {
                this.taskEvents = new TaskEvents( this.app.workspace );
                this.taskStore = new TaskStore( this.taskEvents, this.settings );
                this.taskFileManager = new TaskFileManager( this.app.vault, this.app.metadataCache, this.taskEvents )
                this.parser = new TaskParser();
                await this.loadSettings();
                this.taskSuggest = new TaskEditorSuggest( app, this, this.taskEvents, this.taskStore.getState() );
                this.registerEditorSuggest(this.taskSuggest);
                if ( !this.vaultLoaded )
                    await this.processVault();
                await this.registerEvents();
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

    private setFileState( path: string, state: { hash: string, ready: boolean } ) {
        this.fileStates.set( path, state );
    }

    private getFileHash( path: string ) {
        const hash = this.fileStates.get( path )?.hash ?? '';
        if ( hash === '' )
            this.fileStates.set( path, { hash, ready: false } );
        return hash;
    }

    private isFileReady( file: TFile ) {
        if ( !this.fileStates.has( file.path ) )
            this.fileStates.set( file.path, { hash: '', ready: false } );
        return this.fileStates.get( file.path ).ready;
    }

    private setFileIsReady( file: TFile, ready: boolean ) {
        let st = this.fileStates.get( file.path )
        if ( !st )
            st = { hash: '', ready: false };
        this.fileStates.set( file.path, { ...st, ready } );
    }

    onunload() {
        this.taskStore?.unload();
        this.taskSuggest?.unsubscribe();

        const proms = this.app.vault.getMarkdownFiles().filter( f => !this.ignorePath( f.path ) )
            .map( file => TaskFileManager.removeTaskMetadata(
                file as TFile,
                this.app.vault,
                this.app.metadataCache,
                this.settings.parserSettings
            ) );
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
        this.registerEvent( this.app.metadataCache.on( 'changed', ( file, data, cache ) => {
            if ( !this.changeDebouncers.has( file.path ) )
                this.changeDebouncers.set( file.path, debounce( async (
                    file: TFile,
                    data: string,
                    cache: CachedMetadata
                ) => await this.handleCacheChanged( file, data, cache ), 200, true ) );
            this.changeDebouncers.get( file.path )( file, data, cache );
        } ) );
        const resolvedRef = this.app.metadataCache.on( 'resolve', async () => {
            console.log( 'cache resolved' );
            if ( !this.vaultLoaded ) {
                await this.processVault();
                this.vaultLoaded = true;
            }
            this.app.metadataCache.offref( resolvedRef )
        } );
        this.registerEvent( this.app.workspace.on( 'file-open', async file => {
            await this.onOpenFile( file );
        } ) );
        this.registerEvent( this.app.workspace.on( 'active-leaf-change', (leaf) => {
            console.log('leaf change');
            console.log(leaf);
        }));
    }

    private ignorePath( filePath: string ) {
        return this.settings.ignoredPaths.filter( ignored => filePath.includes( ignored ) ).length > 0;
    }

    private async updateState( newInstanceIndex: TaskInstanceIndex ) {
        this.taskStore.buildStateFromInstances( newInstanceIndex );
        this.state = this.taskStore.getState();

        const trackedFiles = [ ...this.fileStates.keys() ].sort();

        for ( const task of this.state.taskIndex.values() ) {
            const taskFilePath = this.taskFileManager.getTaskPath( task );
            trackedFiles.remove( taskFilePath )
            const hash = this.getFileHash( taskFilePath );
            const stateHash = await hashTask( task );
            if ( hash !== stateHash ) {
                await this.taskFileManager.storeTaskFile( task );
                this.setFileState( taskFilePath, { hash: stateHash, ready: false } );
            }
            else
                this.setFileState( taskFilePath, { hash: stateHash, ready: true } );
        }

        for ( const [ path, fileIndex ] of getFileIndexes( this.state.instanceIndex ) ) {
            if ( path.includes( this.settings.taskDirectoryName ) )
                continue
            trackedFiles.remove( path );
            const hash = this.getFileHash( path );
            const stateHash = hashInstanceIndex( fileIndex );
            if ( hash !== stateHash ) {
                const file = await this.taskFileManager.getFile( path );
                this.setFileState( path, { hash: stateHash, ready: false } );
                if ( [ ...this.settings.indexFiles.keys() ].includes( path ) ) {
                    await this.taskFileManager.writeIndexFile( file, fileIndex )
                }
                else {
                    await this.taskFileManager.writeStateToFile( file, fileIndex )
                }
            }
            else
                this.setFileState( path, { hash: stateHash, ready: true } );
        }
        for ( const path of trackedFiles ) {
            this.fileStates.delete( path );
            await this.taskFileManager.deleteFile( this.app.vault.getAbstractFileByPath( path ) )
        }
        this.updateComponents();
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
                await this.taskFileManager.writeIndexFile( file, instanceIndex );
            else if ( this.taskFileManager.isTaskFile( file ) )
                await this.taskFileManager.storeTaskFile( taskIndex.get( taskUid ) )
            else
                await this.taskFileManager.writeStateToFile( file, storedIndex );
        }
        else
            this.setFileIsReady( file, true );
    }

    private async handleCacheChanged( file: TFile, data: string, cache: CachedMetadata ) {

        // automated write from the file manager, don't trigger update
        if ( !(this.app.workspace.getActiveViewOfType<MarkdownView>( MarkdownView )?.file.path === file.path) ) {
            return;
        }

        if ( this.ignorePath( file.path ) )
            return

        // allows automatic updates of the current active file
        if ( !this.isFileReady( file ) ) {
            this.setFileIsReady( file, true );
            return;
        }

        // TODO: how to handle task file description editing?
        //   - is task file, seems like I may not want to refresh the cache at all in that case
        const { line } = this.app.workspace.getActiveViewOfType( MarkdownView ).editor.getCursor();
        const fileInstances = await this.taskFileManager.getInstanceIndexFromFile( file, cache, data );
        const cursorInst = fileInstances.get( instanceIndexKey( file.path, line ) );
        if ( cursorInst && cursorInst.uid === 0 )
            return;
        const existingFileInstances = filterIndexByPath( file.path, this.taskStore.getState().instanceIndex );
        if ( hashInstanceIndex( fileInstances ) !== hashInstanceIndex( existingFileInstances ) ) {
            const insts = this.taskStore.replaceFileInstances( fileInstances )
            await this.updateState( insts );
        }
    }

    private async handleFileDeleted( abstractFile: TAbstractFile ) {
        if ( abstractFile instanceof TFile ) {
            let instIdx: TaskInstanceIndex;
            try {
                const {id} = parseTaskFilename(abstractFile);
                const task = this.state.taskIndex.get(taskIdToUid( id ));
                instIdx = this.taskStore.deleteTask( task );
            }
            catch ( err: unknown ) {
                // not task file
                instIdx = this.taskStore.deleteTasksFromFile( abstractFile );
            }
            await this.updateState( instIdx);
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
        const instIdx = this.taskStore.renameFilePath(oldPath, abstractFile.path);
        await this.updateState( instIdx );
    }

    private async processVault() {
        if ( this.vaultLoaded ) return;
        const indexList: TaskInstanceIndex[] = [];
        for ( const file of this.app.vault.getMarkdownFiles() ) {
            if ( file.path.includes( this.settings.taskDirectoryName ) || this.ignorePath( file.path ) )
                continue;
            const contents = await this.app.vault.read( file );
            const cache = this.app.metadataCache.getFileCache( file );
            const fileTaskInstances = this.taskFileManager.getFileInstances( file, cache, contents );
            indexList.push( fileTaskInstances );
        }
        const instIdx =this.taskStore.initialize( new Map( indexList.map( idx => [ ...idx ] ).flat() ) );
        this.vaultLoaded = true;
        await this.updateState( instIdx);
    }

    private updateComponents() {
        this.taskSuggest.updateState(this.state);
    }
}
