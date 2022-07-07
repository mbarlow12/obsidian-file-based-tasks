import * as chrono from "chrono-node";
import { ListItemCache } from 'obsidian';
import path from "path";
import { RRule } from "rrule";
import { DEFAULT_PARSER_SETTINGS } from '../Settings';
import { ParsedTask, TaskInstance } from '../Task';
import { taskIdToUid } from "../Task/Task";

export const INVALID_NAME_CHARS = /[\\/|^#\]\[;:]/g;
export const TASK_BASENAME_REGEX = /^(?<name>.+)(?=\((?<id>[\w\d]+)\))(?:\([\w\d]+\))/;

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
    public static LINK_REGEX = /\[\[[^\][]+\]\]/g;
    public static LINE_REGEX = /^\s*[-*] (\[(?<complete>\s|x)?])?\s+(?<taskLine>[^&@].*)$/;
    public static NO_TASK_REGEX = /^\s*[-*]\s+(?<taskLine>[^&@].*)$/;
    public static ID_REGEX = /\s\^[\w\d]+$/;

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
        if ( line.match( TaskParser.ID_REGEX ) ) {
            // parse as task
            return {
                ...this.parseRenderedTask( line ),
                filePath,
                position,
                parent,
                primary: false,
            };
        }

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
            if ( !taskLine.match( /.*[\w\d].*/ ) )
                return null;
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
        const id = (idMatch && idMatch.length && this.stripIdToken( idMatch[ 0 ] ).trim()) || '';
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
            const links = linkMatches.map( l => this.stripLinkToken( l ) );
            const noId = taskLine.replace( TaskParser.ID_REGEX, '' );
            if (
                linkMatches.length === 1 &&
                noId.match( /^\[\[.+]]$/ )
            ) {
                const linkText = noId.replace( /^\[\[/, '' )
                    .replace( /]]$/, '' );
                const taskData = this.parseTaskFromLinkText( linkText );
                if ( taskData ) {
                    taskData.id = id || taskData.id;
                    return {
                        ...pTask,
                        ...taskData,
                        uid: taskIdToUid( taskData.id ),
                        links
                    };
                }
            }
            pTask.links = links;
        }
        const {
            tags, recurrence, dueDate
        } = this.parseLineMetadata( taskLine );
        const name = taskLine.replace( TaskParser.ID_REGEX, '' ).trim();
        if ( !name )
            return null;
        return {
            ...pTask,
            id,
            uid: taskIdToUid( id ),
            name,
            tags,
            recurrence,
            dueDate
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
    private parseTaskFromLinkText( linkText: string ): { id: string, name: string } {
        const pathParts = path.parse( linkText );
        const names = pathParts.name.split( '#^' )
            .filter( s => s );
        if ( !names.length )
            return null;
        const matchedNames = names.filter( n => n.match( TASK_BASENAME_REGEX ) );
        if ( matchedNames.length > 0 ) {
            const { name, id } = matchedNames[ 0 ].match( TASK_BASENAME_REGEX ).groups;
            return { name: name.trim(), id };
        }
        return {
            name: names[ 0 ].trim(),
            id: ''
        };
    }

    static normalizeName( name: string ) {
        return name.replace( INVALID_NAME_CHARS, '_' )
            .replace( /(\s+_+|_+\s+|\s+_+\s+|_+)/g, ' ' ).trim()
            .split( /\s/ ).filter( s => s ).join( ' ' )
            .substring(0, 100);

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
        return s.replace( /\^/g, '' ).trim();
    }

    stripLinks( s: string ) {
        let ret = s + '';
        while ( ret.match( TaskParser.LINK_REGEX ) )
            ret = ret.replace( TaskParser.LINK_REGEX, '' );
        return ret;
    }

    getTokenPattern( token: string ) {
        return `${token}${this.negatedPattern}`;
    }

    stripToken( s: string, token: string ) {
        return s.replace( new RegExp( token, 'g' ), '' );
    }

    private parseLineMetadata( taskLine: string ) {
        const tagMatches = taskLine.match( this.tagRegex ) || [];
        const tags = tagMatches.map( t => this.stripTagToken( t ) )
        const recurrenceMatches = taskLine.match( this.recurrenceRegex ) || [];
        const recurrence = recurrenceMatches.length && parseRecurrence( this.stripRecurrenceToken( recurrenceMatches[ 0 ] ) );
        const dueDateMatches = taskLine.match( this.dueDateRegex ) || [];
        const dueDate = dueDateMatches.length && parseDueDate( this.stripDueDateToken( dueDateMatches[ 0 ] ) );
        const linkMatches = taskLine.match( TaskParser.LINK_REGEX ) || [];
        const links = linkMatches.map( l => this.stripLinkToken( l ) );
        return {
            tags, recurrence, dueDate, links
        }
    }

    private parseRenderedTask( line: string ): ParsedTask {
        const match = line.match( TaskParser.LINE_REGEX );
        if ( match ) {
            const { taskLine, complete } = match.groups;
            if ( !taskLine.match( /.*[\w\d].*/ ) )
                return null;
            const id = this.stripIdToken( line.match( TaskParser.ID_REGEX )[ 0 ] ).trim();
            const { tags, links, recurrence, dueDate } = this.parseLineMetadata( line );
            const name = taskLine.replace( this.tagRegex, '' )
                .replace( TaskParser.ID_REGEX, '' )
                .replace( this.recurrenceRegex, '' )
                .replace( this.dueDateRegex, '' )
                .replace( TaskParser.LINK_REGEX, '' )
            if ( !name )
                return null;
            return {
                id,
                uid: taskIdToUid( id ),
                name,
                tags,
                recurrence,
                dueDate,
                links,
                complete: complete === 'x',
                rawText: line,
                primary: false
            };
        }
        return null;
    }
}