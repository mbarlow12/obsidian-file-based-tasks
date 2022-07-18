import { App, MarkdownView, Plugin, PluginManifest, TAbstractFile, TFile, TFolder } from 'obsidian';
import { getTasksFolder, isTaskFile } from './file';
import { TaskFileManager } from "./file/TaskFileManager";
import { Parser } from './parse/Parser';
import { ITask } from './redux/orm';
import { DEFAULT_SETTINGS, PluginSettings } from './redux/settings';
import { TaskEditorSuggest } from './TaskSuggest';

/**
 * add commands for 'Process file tasks'
 * delete all onCacheChange logic
 *  - what if you press enter, it starts a new task on the line below, but now the empty line is a new parent?
 *  on 'enter' (or custom key), on file close, custom command hotkey
 *      - this is where the temp task would come in handy (placeholder instance?)
 *  - reading files no longer is a problem, now the cache can be used just for writing
 */

export default class ObsidianTaskManager extends Plugin {
    settings: PluginSettings;
    taskFileManager: TaskFileManager;
    taskSuggest: TaskEditorSuggest;
    private currentFile: TFile;
    private vaultLoaded = false;
    private initialized = false;

    constructor( app: App, manifest: PluginManifest ) {
        super( app, manifest );
    }

    async onload() {

        this.app.workspace.onLayoutReady( async () => {
            if ( !this.initialized ) {
                this.taskFileManager = new TaskFileManager( this.app.vault, this.app.metadataCache )
                await this.loadSettings();
                this.taskSuggest = new TaskEditorSuggest( app, this );
                this.registerEditorSuggest( this.taskSuggest );
                if ( !this.vaultLoaded )
                    await this.processVault();
                await this.registerEvents();
                this.initialized = true;
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
            }
        } );
    }

    onunload() {
        this.taskSuggest?.unsubscribe();

        const proms = this.app.vault.getMarkdownFiles().filter( f => !this.ignorePath( f.path ) )
            .map( file => TaskFileManager.removeTaskMetadata(
                file as TFile,
                this.app.vault,
                this.app.metadataCache,
                this.settings.parseOptions
            ) );
        Promise.all( proms )
            .then( () => this.unload() );
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
            if ( ev.key )
                } );


    }

    private ignorePath( filePath: string ) {
        return this.settings.ignoredPaths.includes( filePath ) || filePath in this.settings.indexFiles;
    }

    private async handleFileDeleted( abstractFile: TAbstractFile ) {
        if ( !abstractFile )
            return;
        // if ( abstractFile instanceof TFile ) {
            // dispatch file delete action
        // }
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
    }

    private async processVault() {
        if ( this.vaultLoaded ) return;
        const tasksDir = this.app.vault.getAbstractFileByPath( this.settings.tasksDirectory ) as TFolder;
        const files = this.app.vault.getMarkdownFiles().filter( f => f.parent === tasksDir );
        const tasks = files.reduce( ( tIdx, file ) => {
            const task = this.taskFileManager.readTaskFile()
            return {
                ...tIdx
            }
        }, {} as Record<number, ITask> )
        const indexList: TaskInstanceIndex[] = [];
        for ( const file of this.app.vault.getMarkdownFiles() ) {
            if ( file.path.includes( this.settings.taskDirectoryName ) || this.ignorePath( file.path ) )
                continue;
            const contents = await this.app.vault.read( file );
            const cache = this.app.metadataCache.getFileCache( file );
            const fileTaskInstances = this.taskFileManager.getFileInstances( file, cache, contents );
            indexList.push( fileTaskInstances );
        }
        // const instIdx = this.taskStore.initialize( new Map( indexList.map( idx => [ ...idx ] ).flat() ) );
        // this.vaultLoaded = true;
        // await this.updateState( instIdx );
    }

    private updateComponents() {
        this.taskSuggest.updateState( this.state );
    }
}
