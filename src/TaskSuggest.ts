import {
    App,
    Editor,
    EditorPosition,
    EditorSuggest,
    EditorSuggestContext,
    EditorSuggestTriggerInfo,
    TFile
} from "obsidian";
import { renderTaskInstance } from './file/render';
import ObsidianTaskManager from './main';
import { Parser } from './parse/Parser';
import { allTasks, iTask, ITask, TasksORMState } from './redux/orm';
import { emptyTaskInstance } from './redux/orm/models';


export class TaskEditorSuggest extends EditorSuggest<ITask> {
    static pat = /^\s*[-*] \[(?<complete>\s|x)?]\s+/;
    static taskLinePattern = /^[ \t]*[-*] \[[ x]?]/
    static textPattern = /^[ \t]*[-*] \[[ x]?][ \t]+(?<taskName>(?:\d|\w).*)(?!\^[\w\d]+$)/;

    context: EditorSuggestContext | null;
    limit: number;
    app: App;
    taskState: TasksORMState;

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
        const match = line.match( /\s*[-*] \[.]\s+([\w\d]+)$/ );
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
                editor, query, start, end
            } = this.context;
            const range = editor.getRange( start, end );
            const rStart = editor.posToOffset( editor.getCursor() ) - query.length;
            const inst = emptyTaskInstance()
            const { id, name, complete } = task;
            const line = renderTaskInstance(
                {
                    ...inst,
                    id, name, complete
                },
                '',
                this.plugin.settings.tasksDirectory,
                {
                    ...this.plugin.settings.renderOptions,
                    links: false,
                    primaryLink: false,
                }
            )
            editor.replaceRange(
                `${range[ range.length - 1 ] === " " ? '' : ' '}${line.replace( /[*-]\s+\[.]\s+/, '' )}`,
                editor.offsetToPos( rStart ),
                end
            );
        }
    }
}