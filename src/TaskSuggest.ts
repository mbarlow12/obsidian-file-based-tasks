import {
    App,
    Editor,
    EditorPosition,
    EditorSuggest,
    EditorSuggestContext,
    EditorSuggestTriggerInfo,
    TFile
} from "obsidian";
import { taskAsChecklist } from './file';
import ObsidianTaskManager from './main';
import { getFileInstances } from './parse';
import { Parser } from './parse/Parser';
import { allTasks, iTask, ITask, updateFileInstances } from './store/orm';


export class TaskEditorSuggest extends EditorSuggest<ITask> {
    static pat = /^\s*[-*] \[(?<complete>\s|x)?]\s+/;
    static taskLinePattern = /^[ \t]*[-*] \[[ x]?]/
    static textPattern = /^[ \t]*[-*] \[[ x]?][ \t]+(?<taskName>(?:\d|\w).*)(?!\^[\w\d]+$)/;

    context: EditorSuggestContext | null;
    limit: number;
    app: App;

    private plugin: ObsidianTaskManager;

    constructor( app: App, plugin: ObsidianTaskManager ) {
        super( app );
        this.app = app;
        this.plugin = plugin;
    }

    getSuggestions( context: EditorSuggestContext ): ITask[] | Promise<ITask[]> {
        const searchText = context.query;
        const tasksQuery = allTasks( this.plugin.store.getState().taskDb, this.plugin.orm );
        if ( !context?.query || context.query.trim() === '' )
            return tasksQuery.toModelArray().map( t => iTask( t ) );
        return tasksQuery.filter( t => t.name.startsWith( searchText ) )
            .toModelArray()
            .map( m => iTask( m ) );
    }

    onTrigger( cursor: EditorPosition, editor: Editor, file: TFile ): EditorSuggestTriggerInfo | null {
        if ( editor.getLine( cursor.line ).match( Parser.ID_REGEX ) )
            return null
        const line = editor.getLine( cursor.line ).substring( 0, cursor.ch );
        const match = line.match( /\s*[-*] \[.]\s+([\w\d].*)$/ );
        if ( match ) {
            const q = match[ 1 ].trim();
            return {
                end: cursor,
                start: {
                    ch: match.index,
                    line: cursor.line
                },
                query: q
            };
        }
        return null;
    }

    renderSuggestion( value: ITask, el: HTMLElement ): void {
        const base = createDiv();
        const text = `${value.id} - ${value.name}`;
        base.createDiv( {
            text,
            cls: 'my-cool-class'
        } );
        el.appendChild( base );
    }

    selectSuggestion( task: ITask, evt: MouseEvent | KeyboardEvent ): void {
        if ( this.context ) {
            const {
                start, file
            } = this.context;
            const { id, name, complete } = task;
            const cache = this.app.metadataCache.getFileCache( file );
            const li = cache.listItems.find( i => i.position.start.line === start.line );
            this.app.vault.cachedRead( file )
                .then( contents => {
                    const cache = this.app.metadataCache.getFileCache( file );
                    const instances = getFileInstances( file.path, cache, contents, this.plugin.settings.parseOptions );
                    const parentLine = li?.parent ?? -1;
                    instances[ start.line ] = {
                        id,
                        name,
                        complete,
                        filePath: file.path,
                        line: start.line,
                        parentLine,
                        ...(parentLine > -1 && { parentInstance: instances[ parentLine ] }),
                        dueDate: task.dueDate,
                        childLines: (cache.listItems ?? []).filter( l => l.parent === start.line )
                            .map( li => Number.parseInt( li.id || '0', 16 ) ),
                        rawText: taskAsChecklist( task ),
                        tags: task.tags,
                        links: []
                    };
                    this.plugin.store.dispatch( updateFileInstances( file.path, instances ) );
                } );
        }
    }
}