import * as chrono from "chrono-node";
import { ListItemCache, normalizePath } from 'obsidian';
import * as path from 'path';
import { taskIdToUid } from '../redux';
import { ITaskInstance } from '../redux/orm';
import { emptyTaskInstance, PLACEHOLDER_ID } from '../redux/orm/models';
import { DEFAULT_SETTINGS, ParseOptions } from '../redux/settings';
import { ParsedTask } from './types';

export const INVALID_NAME_CHARS = /[\\/|^#\][;:?]/g;
export const TASK_BASENAME_REGEX = /^(?<name>.+)(?=\((?<id>[\w\d]+)\))\([\w\d]+\)/;

export interface ParserSettings {
    tokens: {
        tag: string,
        recurrence: string;
        dueDate: string;
        divider: string;
    };
    prefix: string;
}

const parseDueDate = ( dueDate: string ): Date | null => chrono.parseDate( dueDate );

/**
 * we only need to strip the id and tailing links if they're task file links
 * rendered tasks are of the form ...task name and tags, links, etc... [[same normalized name (id).md...]] ^id
 */

export class Parser {
    private settings: ParseOptions;
    public static CHECKLIST_REGEX = /^\s*[-*](?: \[[ xX*]])?/;
    public static LINK_REGEX = /\[\[[^\][]+\]\]/g;
    public static LINE_REGEX = /^\s*[-*] (\[(?<complete>[ xX*])?])\s+(?<taskLine>.*)$/;
    public static NO_TASK_REGEX = /^\s*[-*]\s+(?<taskLine>.*)$/;
    public static ID_REGEX = /\s\^[\w\d]+$/;
    public static FILE_LINK_REGEX = /\[\[(?<name>.+)\((?<id>[\w\d]+)\)(\.md)?\]\]/g;
    public static RENDERED_TASK_REGEX = /^\s*[-*](?: \[(?<complete>[ xX*])\])\s+(?<name>[^\s].*)(?=\[\[(?<linkName>.*)\((?<linkId>[\w\d]+)\)(?:\.md)?\]\] \^(?<id>[\w\d]+)$)/;

    static create( settings: ParseOptions ) {
        return new Parser( settings );
    }


    constructor( settings = DEFAULT_SETTINGS.parseOptions ) {
        this.settings = settings;
    }

    /*
     todo: handle strikethrough parsing, start/end with double tildes and adding removing completed dates
     */
    parseInstanceFromLine( line: string, filePath: string, { position, parent }: ListItemCache ): ITaskInstance {
        if ( line.match( Parser.RENDERED_TASK_REGEX ) ) {
            // parse as task
            return {
                ...this.parseRenderedTask( line ),
                filePath,
                parentLine: parent,
                line: position.start.line,
                childLines: []
            };
        }

        const pTask: ParsedTask = this.parseLine( line );
        if ( !pTask ) {
            if (line.match(Parser.CHECKLIST_REGEX)) {
                // empty checklist, placeholder
                const inst = emptyTaskInstance();
                return {
                    ...inst,
                    id: PLACEHOLDER_ID,
                    name: '',
                    line: position.start.line,
                    filePath,
                    parentLine: parent
                }
            }
            return null;
        }
        return {
            ...pTask,
            filePath,
            line: position.start.line,
            parentLine: parent,
            childLines: []
        };
    }

    parseLine( line: string ): ParsedTask {
        const lineMatch = line.match( Parser.LINE_REGEX );
        if ( lineMatch ) {
            const { taskLine, complete } = lineMatch.groups;
            if ( !taskLine.match( /.*[\w\d].*/ ) )
                return null;
            return {
                ...this.parseMatchedContent( taskLine, line ),
                complete: complete && complete.length && complete !== ' ' || false,
            };
        }

        return null;
    }

    parseListItemLine( line: string, filePath: string, { parent, position }: ListItemCache ): ITaskInstance {
        const match = line.match( Parser.NO_TASK_REGEX );
        if ( match ) {
            const { taskLine } = match.groups;
            const pTask = this.parseMatchedContent( taskLine, line );
            if ( !pTask )
                return null;
            return {
                ...pTask,
                filePath,
                parentLine: parent,
                line: position.start.line,
                complete: false,
                childLines: [],
            };
        }
        return null;
    }

    private parseMatchedContent( taskLine: string, rawText: string ): ParsedTask {
        const idMatch = taskLine.match( Parser.ID_REGEX );
        const id = taskIdToUid((idMatch && idMatch.length && this.stripIdToken( idMatch[ 0 ] ).trim()) ?? '');
        const pTask: ParsedTask = {
            id,
            complete: false,
            name: '',
            rawText,
            links: [],
            tags: []
        }
        const linkMatches = taskLine.match( Parser.LINK_REGEX );
        if ( linkMatches && linkMatches.length ) {
            const links = linkMatches.map( l => this.stripLinkToken( l ) );
            const noId = taskLine.replace( Parser.ID_REGEX, '' );
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
                        links
                    };
                }
            }
            pTask.links = links;
        }
        const {
            tags, dueDate
        } = this.parseLineMetadata( taskLine );
        const name = taskLine.replace( Parser.ID_REGEX, '' ).trim();
        if ( !name )
            return null;
        return {
            ...pTask,
            id,
            name,
            tags,
            dueDate
        };
    }

    /*
     TODO: consider render opts on each task instance to control what/how it displays
     - render as link
     - parse instance link
     - use a template
     */

    /**
     * - [ ] [[some link here]]  -->  - [ ] some link here [[some link here (id33)]] ^id33 <<< this is the winner
     *      - [ ] [[some link here (id33)]] ^id33 // no, that changes the existing/intended link
     *      - task name is "some link here"
     * - [ ] [[some link]] #tag @July 1, 2022  --> - [ ] [[some link]] #tag @July 1, 2022 [[some link tag July 1, 2022
     * (1id)]] ^1id
     *      - should the task name be stripped? or just the filename?
     *      - 1: "some link tag July 1, 2022"
     *      - 2: [[some link]] #tag @July 1, 2022 --> need to handle filename change
     * - [ ] [[some task name (taskid1)]]  --> - [ ] some task name #existing #tags [[some task (taskid1)]] ^taskid1
     * @param linkText
     * @private
     */
    private parseTaskFromLinkText( linkText: string ): { id: number, name: string } {
        const pathParts = path.parse( linkText );
        const names = pathParts.name.split( '#^' )
            .filter( s => s );
        if ( !names.length )
            return null;
        const matchedNames = names.filter( n => n.match( TASK_BASENAME_REGEX ) );
        if ( matchedNames.length > 0 ) {
            const { name, id } = matchedNames[ 0 ].match( TASK_BASENAME_REGEX ).groups;
            return { name: name.trim(), id: taskIdToUid( id ) };
        }
        return {
            name: names[ 0 ].trim(),
            id: 0
        };
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
        while ( ret.match( Parser.LINK_REGEX ) )
            ret = ret.replace( Parser.LINK_REGEX, '' );
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
        const dueDateMatches = taskLine.match( this.dueDateRegex ) || [];
        const dueDate = (dueDateMatches.length && parseDueDate( this.stripDueDateToken( dueDateMatches[ 0 ] ) )) || new Date();
        const linkMatches = taskLine.match( Parser.LINK_REGEX ) || [];
        const links = linkMatches.map( l => this.stripLinkToken( l ) );
        return {
            tags, dueDate, links
        }
    }

    private parseRenderedTask( line: string ): ParsedTask {
        const match = line.match( Parser.RENDERED_TASK_REGEX );
        if ( match ) {
            const { complete, name, linkName, id, linkId } = match.groups;
            if ( normalizePath( name ).trim() !== linkName.trim() || id.trim() !== linkId.trim() )
                throw Error( `Tasks with ids cannot be rendered with a different task's link at the end of the link.` );
            const { tags, links, dueDate } = this.parseLineMetadata( line );
            if ( !name )
                return null;
            return {
                id: taskIdToUid( id ),
                name,
                tags,
                dueDate,
                links,
                complete: complete !== ' ',
                rawText: line,
            };
        }
        return null;
    }
}