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
    TasksORMState
} from './redux/orm';
import { deleteFile, renameFileAction } from './redux/orm/actions';
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

type Dis =  {
    dispatch: Dispatch<TaskAction| SettingsAction>
};
export const c: Dis = {
    dispatch: a => a
}

export default class ObsidianTaskManager extends Plugin {
    taskSuggest: TaskEditorSuggest;
    private currentFile: TFile;
    private vaultLoaded = false;
    private initialized = false;
    private store: Store<PluginState, TaskAction|SettingsAction>
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
                await this.loadSettings();
                this.orm = orm;
                this.store = store;
                this.state.taskDb = { ...state };
                this.taskSuggest = new TaskEditorSuggest( app, this );
                this.registerEditorSuggest( this.taskSuggest );
                if ( !this.vaultLoaded )
                    await this.processVault();
                this.addCommand( {
                    id: 'toggle-task-complete',
                    name: 'My toggle checklist',
                    hotkeys: [
                        {
                            key: 'Enter',
                            modifiers: [ 'Mod' ]
                        }
                    ],
                    editorCallback: ( editor, view ) => {
                        const { line, ch } = editor.getCursor();
                        const raw = editor.getLine( line );
                        const start = raw.indexOf( '[' ) + 1;
                        const end = raw.indexOf( ']' );
                        const parser = Parser.create( this.settings.parseOptions );
                        const taskInstance = parser.parseLine( raw );
                        console.log( `${taskInstance.name} ${taskInstance.complete ? 'completed' : 'not completed'}` )
                        console.log( `line ${line} ch ${ch}` );
                        const char = taskInstance.complete ? 'x' : ' ';
                        editor.replaceRange( char, { line, ch: start }, { line, ch: end } );
                        // to dispatch, first make sure we won't register the change
                        // and let the system update the text
                        // const file = view.file;
                        // this.setFileIsReady(file, false);
                        // this.store.dispatch(toggleTaskComplete(id))
                    }
                } );
                await this.registerEvents();
                this.store.subscribe( () => {
                    this.handleStoreUpdate();
                } );
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

            console.log( 'cache resolved' );
            if ( !this.vaultLoaded ) {
                await this.processVault();
                this.vaultLoaded = true;
            }
            this.app.metadataCache.offref( resolvedRef )
        } );
        this.registerEvent( this.app.workspace.on( 'file-open', async file => {
            this.currentFile = file;
        } ) );

        this.registerEvent( this.app.vault.on( 'closed', () => {
            console.log( 'closed event' );
            console.log( this.currentFile.name );
        } ) );

        this.registerEvent( this.app.workspace.on( 'active-leaf-change', ( leaf ) => {
            if ( !leaf )
                return
            console.log( leaf )
        } ) );

        this.registerDomEvent( window, 'keydown', function ( ev: KeyboardEvent ) {
            // if ( ev.key ) {}
        } );
    }

    registerCommands() {
        this.addCommand( {
            id: 'toggle-task-complete',
            name: 'Toggle Task Checklist',
            hotkeys: [
                {
                    key: 'Enter',
                    modifiers: [ 'Mod' ]
                }
            ],
            editorCallback: ( editor, view ) => {
                const cache = this.app.metadataCache.getFileCache( view.file );
                const lis = cache.listItems;
                if ( !lis )
                    return;
                const { line } = editor.getCursor();
                const raw = editor.getLine( line );
                const parser = Parser.create( this.settings.parseOptions );
                const li = lis.find( ( i ) => i.position.start.line === line );
                const taskInstance = parser.fullParseLine( raw, view.file.path, li );
                // to dispatch, first make sure we won't register the change
                // and let the system update the text
                // const file = view.file;
                // this.setFileIsReady(file, false);
                // this.store.dispatch(toggleTaskComplete(id))
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
        // const instIdx = this.taskStore.renameFilePath( oldPath, abstractFile.path );
        // await this.updateState( instIdx );
        if ( !abstractFile )
            return;
        this.store.dispatch( renameFileAction( { oldPath, newPath: abstractFile.path } ) );
        this.store.dispatch
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
        this.vaultLoaded = true;
    }
}
