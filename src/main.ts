import { configureStore, createSelector, Dispatch, Selector, Store } from '@reduxjs/toolkit';
import { App, Plugin, PluginManifest, TAbstractFile, TFile } from 'obsidian';
import { ORM } from 'redux-orm';
import { deleteFileData, getFile, getTasksFolder, removeTaskDataFromContents } from './file';
import { taskFullPath, writeState, writeTask } from './file/render';
import { getFileInstances, readTaskFile } from './parse';
import { Parser } from './parse/Parser';
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
} from './redux/orm';
import { deleteFile, isTaskAction, renameFileAction, toggleTaskStatus } from './redux/orm/actions';
import { repopulateIndexFiles, updateFileInstancesReducer } from './redux/orm/reducer';
import { FileITaskInstanceRecord } from './redux/orm/types';
import { DEFAULT_SETTINGS, SettingsAction } from './redux/settings';
import settingsSlice from './redux/settings/settings.slice';
import { PluginState } from './redux/types';
import { TaskEditorSuggest } from './TaskSuggest';

/**
 * add commands for 'Process file tasks'
 * delete all onCacheChange logic
 *  - what if you press enter, it starts a new task on the line below, but now the empty line is a new parent?
 *  on 'enter' (or custom key), on file close, custom command hotkey
 *      - this is where the temp task would come in handy (placeholder instance?)
 *  - reading files no longer is a problem, now the cache can be used just for writing
 */

type Dis = {
    dispatch: Dispatch<TaskAction | SettingsAction>
};
export const c: Dis = {
    dispatch: a => a
}

export default class ObsidianTaskManager extends Plugin {
    taskSuggest: TaskEditorSuggest;
    store: Store<PluginState, TaskAction | SettingsAction>
    orm: ORM<TaskORMSchema>;
    state: PluginState;
    private currentFile: TFile;
    private vaultLoaded = false;
    private initialized = false;
    private selectFiles: Selector<TasksORMState, string[]>;
    private selectFileInstances: Selector<TasksORMState, ITaskInstance[]>;
    private selectCurrentIds: Selector<TasksORMState, number[]>

    constructor( app: App, manifest: PluginManifest ) {
        super( app, manifest );
    }

    async onload() {

        this.app.workspace.onLayoutReady( async () => {
            if ( !this.initialized ) {
                await this.initStore();
                this.taskSuggest = new TaskEditorSuggest( app, this );
                this.registerEditorSuggest( this.taskSuggest );
                this.selectFiles = createSelector(
                    ( s: TasksORMState ) => Object.values( s.TaskInstance.itemsById ),
                    instRefs => instRefs.map( r => r.filePath )
                        .filter( ( path, i, arr ) => arr.indexOf( path ) === i )
                );

                this.selectFileInstances = createSelector(
                    ( s: TasksORMState ) => this.orm.session( s ).TaskInstance,
                    ( s: TasksORMState, path: string ) => path,
                    ( task, path ) => task.filter( t => t.filePath === path )
                        .orderBy( [ 'line' ] )
                        .toModelArray()
                        .map( m => iTaskInstance( m ) )
                );

                this.selectCurrentIds = createSelector(
                    ( s: TasksORMState ) => [ ...s.Task.items ].sort(),
                    ids => ids
                );
                if ( !this.vaultLoaded )
                    await this.processVault();
                this.registerEvents();
                this.registerCommands();
                this.store.subscribe( () => this.handleStoreUpdate() );
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

    async handleStoreUpdate() {
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
            await writeTask( iTask( newTask ), vault, metadataCache, this.settings.tasksDirectory );
        }

        for ( const cid of currentTaskIds ) {
            const task = currentSession.Task.withId( cid );
            if ( !task )
                continue;
            const path = taskFullPath( task.name, task.id, this.settings.tasksDirectory );
            const file = await getFile( path, vault );
            deletePaths.push( file.path );
        }

        const newPaths = allTaskFiles( newState, this.orm );
        const currentPaths = this.selectFiles( this.state.taskDb );
        for ( let i = 0; i < newPaths.length; i++ ) {
            const newPath = newPaths[ i ];
            currentPaths.remove( newPath );
            const currentFileInstances = this.selectFileInstances( this.state.taskDb, newPath );
            const file = await getFile( newPath, vault, true );
            const isIndex = file.path in this.settings.indexFiles;
            await writeState( file, vault, newState, this.orm, currentFileInstances, isIndex );
        }
        // delete data from paths not in state
        for ( const currentPath of [ ...currentPaths, ...deletePaths ] ) {
            const file = await getFile( currentPath, vault );
            await deleteFileData( file, vault, metadataCache.getFileCache( file ), this.settings )
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
        this.registerEvent( this.app.workspace.on( 'file-open', async file => {
            await this.dispatchFileTaskUpdate( this.currentFile );
            this.currentFile = file;
        } ) );

        this.registerDomEvent( window, 'keyup', async ( ev: KeyboardEvent ) => {
            if ( ev.key === 'Enter' && !ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey ) {
                const file = this.app.workspace.getActiveFile() || this.currentFile;
                await this.dispatchFileTaskUpdate( file );
            }
        } );
    }

    async dispatchFileTaskUpdate( file: TFile ) {
        if ( !file || this.ignorePath( file.path ) )
            return;
        const { vault, metadataCache } = this.app;
        const instances = getFileInstances(
            file.path,
            metadataCache.getFileCache( file ),
            await vault.cachedRead( file ),
            this.settings.parseOptions
        );
        const state = this.store.getState();
        const existing = filePathInstances( state.taskDb, this.orm.session( state.taskDb ) )( file.path ).toModelArray()
            .reduce( ( rec, mIt ) => ({
                ...rec, [ mIt.line ]: iTaskInstance( mIt )
            }), {} as FileITaskInstanceRecord );
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
                const taskInstance = parser.parseLine( editor.getLine( line ) );
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
        // toggle task status
        this.addCommand( {
            id: 'toggle-task',
            name: 'Toggle Task',
            hotkeys: [],
            editorCallback: ( editor, view ) => {
                const { line } = editor.getCursor();
                const cache = this.app.metadataCache.getFileCache( view.file );
                const li = cache.listItems?.find( ( i ) => i.position.start.line === line );
                if ( !li )
                    return;
                const parser = Parser.create( this.settings.parseOptions );
                const taskInstance = parser.parseInstanceFromLine( editor.getLine( line ), view.file.path, li );
                if ( taskInstance && taskInstance.id > 0 )
                    this.store.dispatch( toggleTaskStatus( taskInstance ) );
            }
        } );
    }

    private ignorePath( filePath: string ): boolean {
        if ( filePath in this.settings.indexFiles )
            return true;
        return this.settings.ignoredPaths.reduce( ( ignored, p ) => ignored || filePath.includes( p ), false )
    }

    private async handleFileDeleted( abstractFile: TAbstractFile ) {
        if ( !abstractFile || this.ignorePath( abstractFile.path ) )
            return;
        this.store.dispatch( deleteFile( { path: abstractFile.path } ) );
    }

    /**
     * if task file, we're renaming the task, and its presence in all parents & locations
     * if not a task file, we're only changing location references
     * @param abstractFile
     * @param oldPath
     * @private
     */
    private async handleFileRenamed( abstractFile: TAbstractFile, oldPath: string ) {
        if ( !abstractFile || this.ignorePath( abstractFile.path ) )
            return;
        this.store.dispatch( renameFileAction( { oldPath, newPath: abstractFile.path } ) );
    }

    private async processVault( ret = false ) {
        if ( this.vaultLoaded && !ret )
            return;
        const session = this.orm.mutableSession( this.orm.getEmptyState() )
        const tasksDir = await getTasksFolder( this.settings.tasksDirectory, this.app.vault );
        const files = this.app.vault.getMarkdownFiles().filter( f => !this.ignorePath( f.path ) );
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
                    bestEffortDeduplicate( session, instances );
                    updateFileInstancesReducer( file.path, instances, session, this.settings )
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
