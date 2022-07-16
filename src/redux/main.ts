import {
    App,
    CachedMetadata,
    Editor,
    MarkdownView,
    Modal,
    Notice,
    Plugin,
    PluginSettingTab,
    Setting,
    TFile
} from 'obsidian';
import store, { ITask, ITaskInstanceRecord } from './store';
import { addInstancesFromFile, TaskActionType } from './store/orm';
import { DEFAULT_SETTINGS, PluginSettings, updated } from './store/settings';
import { parseLine, parseTaskFrontmatter } from './utils/parser';

// Remember to rename these classes and interfaces!

export default class MyPlugin extends Plugin {
    settings: PluginSettings;

    async onload() {
        await this.loadSettings();

        // This creates an icon in the left ribbon.
        const ribbonIconEl = this.addRibbonIcon( 'dice', 'Sample Plugin', ( evt: MouseEvent ) => {
            // Called when the user clicks the icon.
            new Notice( 'This is a notice!' );
        } );
        // Perform additional things with the ribbon
        ribbonIconEl.addClass( 'my-plugin-ribbon-class' );

        // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
        const statusBarItemEl = this.addStatusBarItem();
        statusBarItemEl.setText( 'Status Bar Text' );

        // This adds a simple command that can be triggered anywhere
        this.addCommand( {
            id: 'open-sample-modal-simple',
            name: 'Open sample modal (simple)',
            callback: () => {
                new SampleModal( this.app ).open();
            }
        } );
        // This adds an editor command that can perform some operation on the current editor instance
        this.addCommand( {
            id: 'sample-editor-command',
            name: 'Sample editor command',
            editorCallback: ( editor: Editor, view: MarkdownView ) => {
                console.log( editor.getSelection() );
                editor.replaceSelection( 'Sample Editor Command' );
            }
        } );
        // This adds a complex command that can check whether the current state of the app allows execution of the
        // command
        this.addCommand( {
            id: 'open-sample-modal-complex',
            name: 'Open sample modal (complex)',
            checkCallback: ( checking: boolean ) => {
                // Conditions to check
                const markdownView = this.app.workspace.getActiveViewOfType( MarkdownView );
                if ( markdownView ) {
                    // If checking is true, we're simply "checking" if the command can be run.
                    // If checking is false, then we want to actually perform the operation.
                    if ( !checking ) {
                        new SampleModal( this.app ).open();
                    }

                    // This command will only show up in Command Palette when the check function returns true
                    return true;
                }
            }
        } );

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab( new SampleSettingTab( this.app, this ) );

        // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
        // Using this function will automatically remove the event listener when this plugin is disabled.
        this.registerDomEvent( document, 'click', ( evt: MouseEvent ) => {
            console.log( 'click', evt );
        } );

        // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
        this.registerInterval( window.setInterval( () => console.log( 'setInterval' ), 5 * 60 * 1000 ) );

        store.subscribe( async () => {
            this.settings = store.getState().settings;
            await this.saveData( this.settings );
        } )

        this.registerEvent( this.app.metadataCache.on( 'changed', ( file, data, cache ) => {
            if ( this.isTaskFile( file, cache ) ) {
                const task = this.getTaskFromFile( file, data, cache );
                if ( !task )
                    return;
                if ( this.shouldUpdate( task ) )
                    store.dispatch( { type: TaskActionType.UPDATE_TASK, payload: task } )
            }
            else {
                const instances: ITaskInstanceRecord = this.getInstancesFromFile( file, data, cache );
                if ( this.shouldUpdate( instances, file ) )
                    store.dispatch( addInstancesFromFile( file.path, instances ) )
            }
        } ) );
    }

    onFileRename( oldPath: string, newPath: string ) {
        /**
         *     - if both ignored, no dispatch
         *     - if old ignored only, dispatch file instance update
         *     - if new ignored, dispatch file task delete
         *     - if neither ignored dispatch rename
         */

        /**
         * - if neither paths are index files, no settings update
         * - if the user renames a file, then that all just becomes new instances, and we regenerate the original index
         * - cool future option would be to update the settings index file when renaming
         */
    }

    shouldUpdate( task: ITask | ITaskInstanceRecord, file?: TFile ): boolean {
        return true;
    }

    isTaskFile( file: TFile, cache?: CachedMetadata ) {
        return (cache ?? this.app.metadataCache.getFileCache( file ))?.frontmatter?.type === '--TASK--';
    }

    getTaskFromFile( file: TFile, data: string, cache: CachedMetadata ): ITask | undefined {
        if ( cache.frontmatter && cache.frontmatter.type === '--TASK--' ) {
            return parseTaskFrontmatter( cache.frontmatter );
        }
    }

    async getTaskFromFileAsync( file: TFile, data?: string, cache?: CachedMetadata | null ) {
        if ( !data )
            data = await this.app.vault.cachedRead( file );
        if ( !cache )
            cache = this.app.metadataCache.getFileCache( file );
        if ( cache )
            return this.getTaskFromFile( file, data, cache );
    }

    getInstancesFromFile( file: TFile, data: string, cache: CachedMetadata ): ITaskInstanceRecord {
        if ( !cache.listItems )
            return {};
        const tasks = cache.listItems.filter( li => li.task !== undefined );
        if ( !tasks )
            return {};
        const lines = data.split( '\n' );

        return tasks.reduce( ( insts, tli ) => {
            const line = lines[ tli.position.start.line ];
            const instance = parseLine( line, file.path, tli );
            if ( !instance )
                return insts;
            // parents & children
            return {
                ...insts,
                [ Number.parseInt( line ) ]: instance
            };
        }, {} as ITaskInstanceRecord )
    }

    onunload() {

    }

    async loadSettings() {
        this.settings = Object.assign( {}, DEFAULT_SETTINGS, await this.loadData() );
    }

    async saveSettings() {
        await this.saveData( this.settings );
    }
}

class SampleModal extends Modal {
    constructor( app: App ) {
        super( app );
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.setText( 'Woah!' );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class SampleSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor( app: App, plugin: MyPlugin ) {
        super( app, plugin );
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        containerEl.createEl( 'h2', { text: 'Settings for my awesome plugin.' } );

        new Setting( containerEl )
            .setName( 'Tab Size' )
            .setDesc( 'Spaces per tab' )
            .addText( text => {
                text.setPlaceholder( 'Set the number of spaces to render for a tab' )
                    .setValue( this.plugin.settings.tabSize.toString() )
                    .onChange( async val => {
                        store.dispatch( updated( { tabSize: Number.parseInt( val ) } ) );
                    } );
            } );
    }
}
