import {
    App,
    Editor,
    EditorPosition,
    EditorSuggest,
    EditorSuggestContext,
    EditorSuggestTriggerInfo,
    EventRef,
    TFile
} from "obsidian";
import { TaskEvents } from './Events/TaskEvents';
import ObsidianTaskManager from './main';
import { TaskParser } from './Parser/TaskParser';
import { DEFAULT_RENDER_OPTS } from './Settings';
import { TaskStoreState } from './Store/types';
import { Task } from "./Task";
import { taskInstanceFromTask } from './Task/Task';


export class TaskEditorSuggest extends EditorSuggest<Task> {
    static pat = /^\s*[-*] \[(?<complete>\s|x)?]\s+/;
    static taskLinePattern = /^[ \t]*[-*] \[[ x]?]/
    static textPattern = /^[ \t]*[-*] \[[ x]?][ \t]+(?<taskName>(?:\d|\w).*)(?!\^[\w\d]+$)/;

    context: EditorSuggestContext | null;
    limit: number;
    app: App;
    taskState: TaskStoreState;

    private events: TaskEvents;
    private indexUpdateEventRef: EventRef;
    private parser: TaskParser;
    private plugin: ObsidianTaskManager;

    constructor( app: App, plugin: ObsidianTaskManager, events: TaskEvents, taskState: TaskStoreState ) {
        super( app );
        this.app = app;
        this.plugin = plugin;
        this.events = events;
        this.taskState = taskState;
        this.parser = new TaskParser();
        // this.subscribe();
    }

    subscribe() {
        this.indexUpdateEventRef = this.events.registerIndexUpdatedHandler( this.updateState.bind( this ) );
    }

    unsubscribe() {
        this.events.off( this.indexUpdateEventRef );
    }

    updateState( state: TaskStoreState ) {
        this.taskState = state;
    }

    getSuggestions( context: EditorSuggestContext ): Task[] | Promise<Task[]> {
        // const searchText = context.query;
        // const tasks = [...this.taskState.taskIndex.values()].filter(t => t.name.startsWith(searchText));
        if ( !context?.query || context.query.trim() === '' )
            return [ ...this.taskState.taskIndex.values() ].filter( t => !t.complete ).sort()

        return [ ...this.taskState.taskIndex.values() ]
            .filter( t => t.name.includes( context.query ) && !t.complete )
            .sort( ( a, b ) => {
                if ( a.name < b.name )
                    return -1;
                if ( b.name < a.name )
                    return 1;
                if ( a.name === b.name ) {
                    return a.created.getTime() - b.created.getTime();
                }
            } );
    }

    onTrigger( cursor: EditorPosition, editor: Editor, file: TFile ): EditorSuggestTriggerInfo | null {
        if ( editor.getLine( cursor.line ).match( TaskParser.ID_REGEX ) )
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

    renderSuggestion( value: Task, el: HTMLElement ): void {
        const base = createDiv();
        const text = `${value.id} - ${value.name}`;
        base.createDiv( {
            text,
            cls: 'my-cool-class'
        } );
        el.appendChild( base );
    }

    selectSuggestion( value: Task, evt: MouseEvent | KeyboardEvent ): void {
        if ( this.context ) {
            const {
                editor, query, start, end
            } = this.context;
            const range = editor.getRange( start, end );
            const rStart = editor.posToOffset( editor.getCursor() ) - query.length;
            const inst = taskInstanceFromTask( this.context.file.path, this.context.start.line, value );
            const line = this.plugin.taskFileManager.renderTaskInstance( inst, '', {
                ...DEFAULT_RENDER_OPTS,
                links: false
            } )
            editor.replaceRange(
                `${range[ range.length - 1 ] === " " ? '' : ' '}${line.replace( /[*-]\s+\[.]\s+/, '' )}`,
                editor.offsetToPos( rStart ),
                end
            );
        }
    }
}