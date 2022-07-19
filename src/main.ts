import { createSelector, Dispatch, Selector, Store } from '@reduxjs/toolkit';
import { App, Plugin, PluginManifest, TAbstractFile, TFile } from 'obsidian';
import { ORM } from 'redux-orm';
import { deleteFileData, getFile, getTasksFolder, removeTaskDataFromContents } from './file';
import { taskFullPath, writeState, writeTask } from './file/render';
import { getFileInstances, readTaskFile } from './parse';
import { Parser } from './parse/Parser';
import {
    allTaskFiles,
    allTasks,
    iTask,
    iTaskInstance,
    ITaskInstance,
    TaskAction,
    taskCreatePropsFromITask,
    TaskORMSchema,
    tasksEqual,
    TasksORMState,
    updateFileInstances
} from './redux/orm';
import { deleteFile, renameFileAction, toggleTaskStatus } from './redux/orm/actions';
import { updateFileInstancesReducer } from './redux/orm/reducer';
import { DEFAULT_SETTINGS, SettingsAction } from './redux/settings';
import store, { orm, RootState, state } from './redux/store';
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
    private currentFile: TFile;
    private vaultLoaded = false;
    private initialized = false;
    private store: Store<PluginState, TaskAction | SettingsAction>
    private state: RootState;
    private orm: ORM<TaskORMSchema>;
    private selectFiles: Selector<TasksORMState, string[]>;
    private selectFileInstances: Selector<TasksORMState, ITaskInstance[]>;
    private selectCurrentIds: Selector<TasksORMState, number[]>

    constructor( app: App, manifest: PluginManifest ) {
        super( app, manifest );
    }

    async onload() {

        this.app.workspace.onLayoutReady( async () => {
            if ( !this.initialized ) {
                this.orm = orm;
                this.store = store;
                this.state = { ...state };
                await this.loadSettings();
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
                // this.store.subscribe( () => {
                //     this.handleStoreUpdate();
                // } );
                this.initialized = true;
            }
        } );
    }

    get settings() {
        return this.state.settings;
    }

    get parseOptions() {
        return this.state.settings.parseOptions;
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
            const task = currentSession.Task.withId( newTask.id );
            if ( task && tasksEqual( iTask( newTask ), iTask( task ) ) )
                continue;
            await writeTask( iTask( newTask ), vault, metadataCache, this.settings.tasksDirectory );
            currentTaskIds.remove( newTask.id );
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
    }

    onunload() {
        this.taskSuggest?.unsubscribe();

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

    async loadSettings() {
        this.state.settings = Object.assign( {}, DEFAULT_SETTINGS, await this.loadData() );
    }

    async saveSettings() {
        await this.saveData( this.settings );
    }

    registerEvents() {
        this.registerEvent( this.app.vault.on( 'delete', this.handleFileDeleted.bind( this ) ) );
        this.registerEvent( this.app.vault.on( 'rename', this.handleFileRenamed.bind( this ) ) );
        const resolvedRef = this.app.metadataCache.on( 'resolve', async () => {

            if ( !this.vaultLoaded ) {
                await this.processVault();
                this.vaultLoaded = true;
            }
            this.app.metadataCache.offref( resolvedRef )
        } );
        this.registerEvent( this.app.workspace.on( 'file-open', async file => {
            if ( this.currentFile )
                await this.dispatchFileTaskUpdate( file );
            this.currentFile = file;
        } ) );

        this.registerDomEvent( window, 'keyup', async ( ev: KeyboardEvent ) => {
            if ( ev.key === 'Enter' && !ev.shiftKey && !ev.ctrlKey && !ev.altKey && !ev.metaKey ) {
                const file = this.app.workspace.getActiveFile() || this.currentFile;
                if ( !file )
                    return;
                await this.dispatchFileTaskUpdate( file );
            }
        } );
    }

    async dispatchFileTaskUpdate( file: TFile ) {
        const { vault, metadataCache } = this.app;
        const instances = getFileInstances(
            file.path,
            metadataCache.getFileCache( file ),
            await vault.cachedRead( file ),
            this.settings.parseOptions
        );
        this.store.dispatch( updateFileInstances( file.path, instances ) );
    }

    registerCommands() {
        // commands:
        // create task
        this.addCommand({
            id: 'insert-new-task',
            name: 'Create Task',
            hotkeys: [],
        })
        // insert task
        // delete task
        // go to task under cursor
        // update task
        // archive tasks
        // toggle task status
        this.addCommand( {
            id: 'toggle-task',
            name: 'Toggle Task',
            hotkeys: [],
            editorCallback: ( editor, view ) => {
                const cache = this.app.metadataCache.getFileCache( view.file );
                const li = cache.listItems?.find( ( i ) => i.position.start.line === line );
                if ( !li )
                    return;
                const { line } = editor.getCursor();
                const parser = Parser.create( this.settings.parseOptions );
                const taskInstance = parser.fullParseLine( editor.getLine( line ), view.file.path, li );
                if (taskInstance && taskInstance.id > 0)
                    this.store.dispatch( toggleTaskStatus( taskInstance ) );
            }
        } );
    }

    private ignorePath( filePath: string ) {
        return this.settings.ignoredPaths.includes( filePath ) || filePath in this.settings.indexFiles;
    }

    private async handleFileDeleted( abstractFile: TAbstractFile ) {
        if ( !abstractFile )
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
        if ( !abstractFile )
            return;
        this.store.dispatch( renameFileAction( { oldPath, newPath: abstractFile.path } ) );
    }

    private async processVault() {
        if ( this.vaultLoaded ) return;
        const session = this.orm.mutableSession( this.state.taskDb )
        const tasksDir = getTasksFolder( this.settings.tasksDirectory, this.app.vault );
        const files = this.app.vault.getMarkdownFiles().filter( f => f.parent === tasksDir );
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
                    updateFileInstancesReducer( file.path, instances, session, this.settings )
                }
            }
        }
        this.state = { ...this.state, taskDb: session.state };
        await this.handleStoreUpdate();
        this.vaultLoaded = true;
    }
}
