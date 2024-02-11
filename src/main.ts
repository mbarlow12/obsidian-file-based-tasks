import { App, CachedMetadata, debounce, MarkdownView, Plugin, PluginManifest, TAbstractFile, TFile } from 'obsidian';
import { deleteTaskDataFromFile, getTasksFolder, isTaskFile, removeTaskDataFromContents } from './file';
import { taskFullPath, writeState, writeTask } from './file/render';
import { AppHelper } from './helper';
import { getFileInstances, readTaskFile } from './parse';
import { Parser, TASK_BASENAME_REGEX } from './parse/Parser';
import {
    allTaskFiles,
    allTasks,
    bestEffortDeduplicate,
    filePathInstances,
    fileRecordsEqual,
    iTask,
    iTaskInstance,
    ITaskInstance,
    reducerCreator,
    Tag,
    Task,
    TaskAction,
    taskCreatePropsFromITask,
    TaskInstance,
    TaskORMSchema,
    tasksEqual,
    TasksORMState,
    updateFileInstances
} from './store/orm';
import {
    deleteFile,
    deleteTask,
    isTaskAction,
    renameFileAction,
    toggleTaskStatus,
    updateTaskAction
} from './store/orm/actions';
import { repopulateIndexFiles, updateFileInstancesReducer } from './store/orm/reducer';
import { FileITaskInstanceRecord } from './store/orm/types';
import { DEFAULT_SETTINGS, SettingsAction } from './store/settings';
import settingsSlice from './store/settings/settings.slice';
import { PluginState } from './store/types';
import { TaskEditorSuggest } from './TaskSuggest';

export default class ObsidianTaskManager extends Plugin {
    taskSuggest: TaskEditorSuggest;
    state: PluginState;
    readyForUpdate = false;
    private currentFile: TFile;
    private vaultLoaded = false;
    private initialized = false;

    constructor( app: App, manifest: PluginManifest ) {
        super( app, manifest );
        AppHelper.init( app, this )
    }

    async onload() {

        this.app.workspace.onLayoutReady( async () => {
            if ( !this.initialized ) {
                await this.initStore();
                this.taskSuggest = new TaskEditorSuggest( app, this );
                this.registerEditorSuggest( this.taskSuggest );
                if ( !this.vaultLoaded )
                    await this.processVault();
                this.registerEvents();
                this.registerCommands();
                await this.handleStoreUpdate();
                this.initialized = true;
            }
        } );
    }

    get settings() {
        return this.state.settings;
    }

    get parseOptions() {
        return this.settings.parseOptions;
    }

    async handleStoreUpdate( init = false ) {
        const { vault, metadataCache } = this.app;
        const currentSession = this.orm.session( this.state.taskDb );
        const newState = this.store.getState();
        // tasks
        const newTasks = allTasks( newState.taskDb, this.orm ).toModelArray();
        const currentTaskIds = this.selectCurrentIds( this.state.taskDb );
        const deletePaths: string[] = [];
        for ( let i = 0; i < newTasks.length; i++ ) {
            const newTask = newTasks[ i ];
            currentTaskIds.remove( newTask.id );
            const task = currentSession.Task.withId( newTask.id );
            if ( task && tasksEqual( iTask( newTask ), iTask( task ) ) )
                continue;
            await writeTask( iTask( newTask ), vault, metadataCache, this.settings.tasksDirectory, init );
        }

        for ( const cid of currentTaskIds ) {
            const task = currentSession.Task.withId( cid );
            if ( !task )
                continue;
            const path = taskFullPath( task.name, task.id, this.settings.tasksDirectory );
            deletePaths.push( path );
        }

        const newPaths = allTaskFiles( newState, this.orm );
        const currentPaths = this.selectFiles( this.state.taskDb );
        for ( let i = 0; i < newPaths.length; i++ ) {
            const newPath = newPaths[ i ];
            currentPaths.remove( newPath );
            let file = vault.getAbstractFileByPath( newPath ) as TFile;
            if ( !file )
                file = await vault.create( newPath, '' );
            await writeState(
                file,
                newState,
                init
            );
        }
        // delete data from paths not in state
        for ( const currentPath of [ ...currentPaths, ...deletePaths ] ) {
            const file = vault.getAbstractFileByPath( currentPath ) as TFile;
            if ( !file )
                continue;
            const { mtime } = file.stat;
            await deleteTaskDataFromFile( file, vault, metadataCache.getFileCache( file ), this.settings )
            //@ts-ignore
            if ( file && !file.deleted )
                file.stat.mtime = mtime;
        }

        this.state = newState;
        await this.saveSettings();
    }

    onunload() {
        // use store state
        const proms = this.app.vault.getMarkdownFiles().filter( f => !this.ignorePath( f.path ) )
            .map( async file => {
                const stripped = removeTaskDataFromContents(
                    await this.app.vault.read( file ),
                    this.app.metadataCache.getFileCache( file ),
                    this.settings.parseOptions
                );
                await this.app.vault.modify( file, stripped );
            } )
        Promise.all( proms )
            .then( () => this.unload() );
    }

    async initStore() {
        this.orm = new ORM<TaskORMSchema>();
        this.orm.register( Task, TaskInstance, Tag );
        const existing = await this.loadData();
        const settings = Object.assign( {}, DEFAULT_SETTINGS, existing );
        this.state = { settings, taskDb: this.orm.getEmptyState() };
        const taskDb = await this.processVault( true );
        const initialState: PluginState = { settings, taskDb };
        const taskReducer = reducerCreator( this.orm, initialState.taskDb );
        this.store = configureStore( {
            reducer: ( state: PluginState, action: TaskAction | SettingsAction ) => {
                if ( !state )
                    return initialState;
                let taskState = state.taskDb;
                if ( isTaskAction( action ) )
                    taskState = taskReducer( state, action );
                return {
                    settings: settingsSlice( state.settings, action ),
                    taskDb: taskState
                };
            }
        } );
    }

    async loadSettings() {
        const settings = Object.assign( {}, DEFAULT_SETTINGS, await this.loadData() );
        if ( !this.state ) {
            this.state = {
                settings,
                taskDb: this.orm.getEmptyState(),
            }
        }
        else
            this.state.settings = settings;
    }

    async saveSettings() {
        await this.saveData( this.settings );
    }


    registerEvents() {
        this.registerEvent( this.app.vault.on( 'delete', this.handleFileDeleted.bind( this ) ) );
        this.registerEvent( this.app.vault.on( 'rename', this.handleFileRenamed.bind( this ) ) );

        this.registerEvent( this.app.workspace.on( 'file-open', async ( file ) => {
            if ( this.currentFile ) {
                const cache = this.app.metadataCache.getFileCache( this.currentFile );
                // @ts-ignore
                if ( !this.currentFile.deleted && cache ) {
                    const contents = await this.app.vault.cachedRead( this.currentFile );
                    this.updateFromFile( this.currentFile, cache, contents, false );
                }
            }
            this.currentFile = file;
        } ) );

        this.registerDomEvent( window, 'keydown', async ( ev: KeyboardEvent ) => {
            if ( ev.key === 'Enter' ) {
                this.readyForUpdate = true;
            }
        } );

        const debouncedUpdate = debounce( ( file: TFile, data: string, cache: CachedMetadata ) => {
            this.updateFromFile( file, cache, data );
        }, 100, true );

        this.registerEvent( this.app.metadataCache.on( 'changed', async ( file, data, cache ) => {
            if ( this.app.workspace.getActiveFile() !== file || this.ignorePath( file.path, false ) )
                return;
            if ( this.readyForUpdate ) {
                this.readyForUpdate = false;
                debouncedUpdate( file, data, cache );
            }
        } ) );
    }

    updateTask( file: TFile, data: string, cache: CachedMetadata ) {
        const task = readTaskFile( file, cache, data );
        this.store.dispatch( updateTaskAction( task ) );
    }

    updateFileTasks( file: TFile, data: string, cache: CachedMetadata, removeCursorLine = true ) {
        const { parseOptions } = this.settings;
        const { taskDb } = this.store.getState();
        const instances = getFileInstances( file.path, cache, data, parseOptions );
        const existing = filePathInstances( taskDb, this.orm.session( taskDb ) )( file.path ).toModelArray()
            .reduce( ( rec, mIt ) => ({
                ...rec, [ mIt.line ]: iTaskInstance( mIt )
            }), {} as FileITaskInstanceRecord );
        const cursor = this.app.workspace.getActiveViewOfType( MarkdownView ).editor.getCursor();
        if ( removeCursorLine )
            delete instances[ cursor.line ];
        if ( !fileRecordsEqual( instances, existing ) )
            this.store.dispatch( updateFileInstances( file.path, instances ) );
    }

    registerCommands() {
        // commands:
        // create task
        this.addCommand( {
            id: 'create-task',
            name: 'Create Task',
            hotkeys: [],
            editorCallback: ( editor, view ) => {
                // open task create modal
                // add task with instance at cursor location
            }
        } );
        // insert task
        // delete task
        this.addCommand( {
            id: 'delete-task',
            name: 'Delete Task',
            hotkeys: [],
            editorCallback: ( editor, view ) => {
                const { line } = editor.getCursor();
                const parser = Parser.create( this.settings.parseOptions );
                const li = this.app.metadataCache.getFileCache( view.file ).listItems
                    .find( lic => lic.position.start.line === line );
                if ( !li )
                    return;
                const taskInstance = parser.parseInstanceFromLine( editor.getLine( line ), view.file.path, li );
                if ( !taskInstance || taskInstance.id <= 0 )
                    return;
                this.store.dispatch( deleteTask( taskInstance.id ) );
            }
        } );
        // go to task under cursor
        this.addCommand( {
            id: 'go-to-task',
            name: 'Go to Task under cursor',
            hotkeys: [],
            editorCallback: async ( editor, view ) => {
                const { line } = editor.getCursor();
                const parser = Parser.create( this.settings.parseOptions );
                const li = this.app.metadataCache.getFileCache( view.file ).listItems
                    .find( lic => lic.position.start.line === line );
                if ( !li )
                    return;
                const taskInstance = parser.parseInstanceFromLine( editor.getLine( line ), view.file.path, li );
                if ( taskInstance && taskInstance.id > 0 ) {
                    const path = taskFullPath( taskInstance.name, taskInstance.id, this.settings.tasksDirectory );
                    const file = this.app.vault.getAbstractFileByPath( path ) as TFile;
                    if ( !file ) {
                        console.log( `${file.name} not found` );
                    }
                    const vaultRootpath = this.app.vault.getRoot().path;
                    const linkText = this.app.metadataCache.fileToLinktext( file, vaultRootpath, false );
                    await this.app.workspace.openLinkText( linkText, vaultRootpath );
                }
            }
        } );
        // update task
        // archive tasks

        // update from file
        this.addCommand( {
            id: 'update-from-file',
            name: 'Update Task Data from File',
            hotkeys: [
                {
                    key: 'u',
                    modifiers: [ 'Shift', 'Ctrl' ]
                }
            ],
            editorCallback: async ( editor, view ) => {
                const { file } = view;
                const { cache, contents } = await this.getFileData( file );
                this.updateFromFile( file, cache, contents, false );
            }
        } );

        // toggle task status
        this.addCommand( {
            id: 'toggle-task',
            name: 'Toggle Task',
            hotkeys: [],
            editorCallback: ( editor, view ) => {
                const cache = this.app.metadataCache.getFileCache( view.file );
                const { line } = editor.getCursor();
                const li = cache.listItems?.find( ( i ) => i.position.start.line === line );
                if ( !li )
                    return;
                const lineStr = editor.getLine( line );
                const match = lineStr.match( Parser.LINE_REGEX );
                if ( !match )
                    return;
                const start = lineStr.indexOf( '[' ) + 1;
                const end = lineStr.indexOf( ']' );
                const complete = match.groups.complete !== ' ' ? ' ' : 'x';
                editor.replaceRange( complete, { line, ch: start }, { line, ch: end } );
                const parser = Parser.create( this.settings.parseOptions );
                const taskInstance = parser.parseInstanceFromLine( editor.getLine( line ), view.file.path, li );
                if ( taskInstance && taskInstance.id > 0 )
                    this.store.dispatch( toggleTaskStatus( taskInstance ) );
            }
        } );
    }

    private updateFromFile( file: TFile, cache: CachedMetadata, contents: string, removeCursor = true ) {
        if ( !file || this.ignorePath( file.path, false ) )
            return;
        if ( isTaskFile( file, cache ) ) {
            this.updateTask( file, contents, cache );
        }
        else {
            this.updateFileTasks( file, contents, cache, removeCursor );
        }
    }

    ignorePath( filePath: string, ignoreIdx = true ): boolean {
        if ( filePath in this.settings.indexFiles )
            return ignoreIdx;
        return this.settings.ignoredPaths.reduce( ( ignored, p ) => ignored || filePath.includes( p ), false )
    }

    async getFileData( file: TFile ) {
        return {
            cache: this.app.metadataCache.getFileCache( file ),
            contents: await this.app.vault.read( file )
        }
    }

    private async handleFileDeleted( abstractFile: TAbstractFile ) {
        if ( !abstractFile || this.ignorePath( abstractFile.path ) || !(abstractFile instanceof TFile) )
            return;
        if ( abstractFile.path.includes( this.settings.tasksDirectory ) ) {
            const idMatch = abstractFile.basename.trim().match( /\(([\w\d]+)\)$/ );
            if ( idMatch ) {
                const id = idMatch[ 1 ];
                this.store.dispatch( deleteTask( Number.parseInt( id, 16 ) ) )
            }
        }
        else {
            this.store.dispatch( deleteFile( { path: abstractFile.path } ) );
        }
    }

    private async handleFileRenamed( abstractFile: TAbstractFile, oldPath: string ) {
        if ( !abstractFile || this.ignorePath( abstractFile.path, false ) || !(abstractFile instanceof TFile) )
            return;

        if ( abstractFile.path.includes( this.settings.tasksDirectory ) ) {
            const { cache, contents } = await this.getFileData( abstractFile );
            const task = readTaskFile( abstractFile, cache, contents );
            const match = abstractFile.basename.match( TASK_BASENAME_REGEX );
            if ( !match )
                return;
            const { name } = match.groups;
            this.store.dispatch( updateTaskAction( { ...task, name } ) )
        }
        else
            this.store.dispatch( renameFileAction( { oldPath, newPath: abstractFile.path } ) );
    }

    private async processVault( ret = false ) {
        if ( this.vaultLoaded && !ret )
            return;
        const session = this.orm.mutableSession( this.orm.getEmptyState() )
        const tasksDir = getTasksFolder( this.settings.tasksDirectory, this.app.vault );
        if ( !tasksDir )
            await this.app.vault.createFolder( this.settings.tasksDirectory );
        const files = this.app.vault.getMarkdownFiles().filter( f => !this.ignorePath( f.path ) );
        const seenIds = new Set<number>();
        for ( let i = 0; i < files.length; i++ ) {
            const file = files[ i ];
            if ( file.parent === tasksDir ) {
                const task = readTaskFile(
                    files[ i ],
                    this.app.metadataCache.getFileCache( files[ i ] ),
                    await this.app.vault.read( files[ i ] )
                )
                session.Task.create( taskCreatePropsFromITask( task ) );
            }
            else {
                const cache = this.app.metadataCache.getFileCache( file );
                if ( cache.listItems ) {
                    const contents = await this.app.vault.read( file );
                    const instances = getFileInstances( file.path, cache, contents, this.settings.parseOptions );
                    Object.values( instances ).forEach( i => seenIds.add( i.id ) );
                    seenIds.delete( 0 );
                    bestEffortDeduplicate( session, instances );
                    updateFileInstancesReducer( file.path, instances, session, this.settings );
                    for ( const newInst of filePathInstances( session.state, session )( file.path ).toModelArray() ) {
                        const id = newInst.task.id;
                        if ( !seenIds.has( id ) ) {
                            session.Task.withId( id ).update( { created: file.stat.mtime } );
                        }
                    }
                }
            }
        }
        repopulateIndexFiles( session, this.settings.indexFiles );
        this.vaultLoaded = true;
        if ( ret )
            return session.state;
        await this.handleStoreUpdate();
    }
}
