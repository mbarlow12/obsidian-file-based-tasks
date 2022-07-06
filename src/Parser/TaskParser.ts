import * as chrono from "chrono-node";
import { ListItemCache } from 'obsidian';
import path from "path";
import { RRule } from "rrule";
import { DEFAULT_PARSER_SETTINGS } from '../Settings';
import { ParsedTask, TaskInstance } from '../Task';
import { taskIdToUid } from "../Task/Task";

export const INVALID_NAME_CHARS = /[\\/|^#\][]/g;
export const TASK_BASENAME_REGEX = /^(?<name>[^)(]+)(?=\((?<id>[\w\d]+)\))(?:\([\w\d]+\))/;

export interface ParserSettings {
    tokens: {
        tag: string,
        recurrence: string;
        dueDate: string;
        divider: string;
    };
    prefix: string;
}

// const parseTags = (tags: string): string[] => [];
const parseRecurrence = ( recurrence: string ): RRule | null => {
    try {
        return RRule.fromText( recurrence );
    }
    catch ( e ) {
        console.log( e );
        return null
    }
}
const parseDueDate = ( dueDate: string ): Date | null => chrono.parseDate( dueDate );

export class TaskParser {
    private settings: ParserSettings;
    public static LINK_REGEX = /\[\[[^\]]+\]\]/g;
    public static LINE_REGEX = /^\s*[-*] (\[(?<complete>\s|x)?])?\s+(?<taskLine>[^&@].*)$/;
    public static NO_TASK_REGEX = /^\s*[-*]\s+(?<taskLine>[^&@].*)$/;
    public static ID_REGEX = /\^[\w\d]+$/;

    constructor( settings = DEFAULT_PARSER_SETTINGS ) {
        this.settings = settings;
    }

    updateSettings( settings: ParserSettings ) {
        this.settings = settings;
    }

    /*
     todo: handle strikethrough parsing, start/end with double tildes and adding removing completed dates
     */
    fullParseLine( line: string, filePath: string, { position, parent }: ListItemCache ): TaskInstance {
        const pTask: ParsedTask = this.parseLine( line );
        if ( !pTask )
            return null;
        return {
            ...pTask,
            filePath,
            position,
            parent,
            primary: false,
        };
    }

    parseLine( line: string ): ParsedTask {
        const lineMatch = line.match( TaskParser.LINE_REGEX );
        if ( lineMatch ) {
            const { taskLine, complete } = lineMatch.groups;
            return {
                ...this.parseMatchedContent( taskLine, line ),
                complete: complete === 'x'
            };
        }

        return null;
    }

    parseListItemLine( line: string, filePath: string, { parent, position }: ListItemCache ): TaskInstance {
        const match = line.match( TaskParser.NO_TASK_REGEX );
        if ( match ) {
            const { taskLine } = match.groups;
            const pTask = this.parseMatchedContent( taskLine, line );
            if ( !pTask )
                return null;
            return {
                ...pTask,
                filePath,
                parent,
                position: { ...position },
                complete: false,
                primary: false,
            };
        }
        return null;
    }

    private parseMatchedContent( taskLine: string, rawText: string ) {
        const idMatch = taskLine.match( TaskParser.ID_REGEX );
        const id = (idMatch && idMatch.length && this.stripIdToken( idMatch[ 0 ] )) || '';
        const pTask: ParsedTask = {
            id,
            uid: taskIdToUid( id ),
            complete: false,
            name: '',
            rawText,
            primary: false,
        }
        const linkMatches = taskLine.match( TaskParser.LINK_REGEX );
        if ( linkMatches && linkMatches.length ) {
            const links = linkMatches.map(l => this.stripLinkToken( l ) );
            // if the only thing on the line is a single link, extract its text (and id if it's a task file title)
            // and use that to create the new task instances
            if (
                linkMatches.length === 1 &&
                taskLine.indexOf( linkMatches[ 0 ] ) === 0  &&
                taskLine.replace(TaskParser.LINK_REGEX, '')
                    .replace(TaskParser.ID_REGEX, '')
                    .trim() === ''
            ) {
                const taskData = this.parseTaskFromLinkText( linkMatches.pop() );
                if (taskData) {
                    if (id !== '' && taskData.id !== '' && taskData.id !== id)
                        taskData.id = id;
                    return {
                        ...pTask,
                        ...taskData,
                        uid: taskIdToUid(taskData.id),
                        links
                    };
                }
            }
            pTask.links = links;
        }
        const tags = taskLine.match( this.tagRegex ) || [];
        if ( tags.length )
            pTask.tags = tags.map( t => this.stripTagToken( t ) );
        const recurrenceMatches = taskLine.match( this.recurrenceRegex ) || [];
        const recurrence = recurrenceMatches.length && parseRecurrence( this.stripRecurrenceToken( recurrenceMatches[ 0 ] ) );
        if ( recurrence )
            pTask.recurrence = recurrence;
        const dueDateMatches = taskLine.match( this.dueDateRegex ) || [];
        const dueDate = dueDateMatches.length && parseDueDate( this.stripDueDateToken( dueDateMatches[ 0 ] ) );
        if ( dueDate )
            pTask.dueDate = dueDate;
        const name = taskLine.replace( TaskParser.ID_REGEX, '' ).trim();
        if ( !name )
            return null;
        return {
            ...pTask,
            id,
            uid: taskIdToUid( id ),
            name
        };
    }
    /*
    TODO: consider render opts on each task instance to control what/how it displays
        - render as link
        - parse instance link
     */

    /**
     * - [ ] [[some link here]]  -->  - [ ] some link here [[some link here]] ^id33 <<< this is the winner
     *      - [ ] [[some link here (id33)]] ^id33 // no, that changes the existing/intended link
     *      - task name is "some link here"
     * - [ ] [[some link]] #tag @July 1, 2022  -->  unchanged except for the id
     *      - should the task name be stripped? or just the filename?
     *      - 1: "some link tag July 1, 2022"
     *      - 2: [[some link]] #tag @July 1, 2022 --> need to handle filename change
     * - [ ] [[some task name (taskid1)]]  --> - [ ] some task name #existing #tags [[some task (taskid1)]] ^taskid1
     * @param linkText
     * @private
     */
    private parseTaskFromLinkText( linkText: string ): {id: string, name: string} {
        const pathParts = path.parse( this.stripLinkToken( linkText ) );
        const names = pathParts.name.split( INVALID_NAME_CHARS )
            .filter( s => s );
        if ( !names.length )
            return null;
        const matchedNames = names.filter( n => n.match( TASK_BASENAME_REGEX ) );
        if ( matchedNames.length > 0 ) {
            const { name, id } = matchedNames[ 0 ].match( TASK_BASENAME_REGEX ).groups;
            return { name: name.trim(), id };
        }
        return {
            name: names.pop().trim(),
            id: ''
        };
    }

    static normalizeName( name: string ) {
        return name.replace( INVALID_NAME_CHARS, '_' )
            .replace( /(\s+_+|_+\s+|\s+_+\s+)/g, ' ' ).trim()
            .split( /\s/ ).filter( s => s ).join( ' ' );

    }

    get namePattern() {
        return `^${this.negatedPattern}`;
    }

    get nameRegex() {
        return new RegExp( this.namePattern );
    }

    get negatedPattern() {
        const { tag, dueDate, recurrence } = this.settings.tokens;
        return `(?:[^${tag}${dueDate}${recurrence}\\[\\^]|)+`
    }

    get negatedRegex() {
        return new RegExp( this.negatedPattern )
    }

    get tagPattern() {
        const { tag, dueDate, recurrence } = this.settings.tokens;
        const negatedTokens = [ tag, dueDate, recurrence, '\\s', '\\[', '\\^' ];
        return `${tag}[^${negatedTokens.join( '' )}]+`;
    }

    get tagRegex() {
        return new RegExp( this.tagPattern, 'g' );
    }

    stripTagToken( s: string ) {
        return this.stripToken( s, this.settings.tokens.tag );
    }

    get recurrencePattern() {
        const { recurrence } = this.settings.tokens;
        return this.getTokenPattern( recurrence );
    }

    get recurrenceRegex() {
        return new RegExp( this.recurrencePattern, 'g' );
    }

    stripRecurrenceToken( s: string ) {
        return this.stripToken( s, this.settings.tokens.recurrence );
    }

    get dueDatePattern() {
        const { dueDate } = this.settings.tokens;
        return this.getTokenPattern( dueDate );
    }

    get dueDateRegex() {
        return new RegExp( this.dueDatePattern, 'g' );
    }

    stripDueDateToken( s: string ) {
        return this.stripToken( s, this.settings.tokens.dueDate );
    }

    stripLinkToken( s: string ) {
        return s.replace( /[[\]]/g, '' );
    }

    stripIdToken( s: string ) {
        return s.replace( /\^/g, '' );
    }

    getTokenPattern( token: string ) {
        return `${token}${this.negatedPattern}`;
    }

    stripToken( s: string, token: string ) {
        return s.replace( new RegExp( token, 'g' ), '' );
    }

}