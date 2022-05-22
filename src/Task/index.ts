import { Loc, Pos } from "obsidian";
import { MinTaskLocation, TaskFileLocation, TaskLocation } from "./types";

export {
    getTaskFromYaml,
    taskToTaskFileContents,
    taskToJsonString,
    taskAsChecklist,
    taskToYamlObject,
    taskFileLine,
    taskToBasename,
    taskToFilename,
    compareTaskChildren,
    baseTasksSame,
    hashTask,
    parseTaskFilename,
    compareArrays,
} from './Task'
export * from "./types"

export const LOC_DELIM = '||';

export const loc = ( line: number, col: number, offset: number ): Loc => ({ line, col, offset });

export const posFromStr = ( position: string ): Pos => pos( ...position.split( LOC_DELIM ).map( Number.parseInt ) )

export const pos = ( ...locData: number[] ): Pos => {
    if ( locData.length != 6 ) {
        throw new Error( "Must provide line, col, offset for both start and end (6 total args)." )
    }
    const [ sline, scol, soff ] = locData.slice( 0, 3 );
    const [ eline, ecol, eoff ] = locData.slice( 3 );
    return {
        start: loc( sline, scol, soff ),
        end: loc( eline, ecol, eoff ),
    };
}

export const locStr = ( { line, col, offset }: Loc ): string => [ line, col, offset ].join( LOC_DELIM );

export const posStr = ( { start, end }: Pos ): string => [ locStr( start ), locStr( end ) ].join( LOC_DELIM );

/* 'tasks/some greate task - 332.md||0||0||0||1||4||80||-1' */
export const taskFileLocationToStr = ( filePath: string, { position, parent }: TaskFileLocation ): string => [ filePath,
                                                                                                               posStr( position ),
                                                                                                               `${parent}` ].join( LOC_DELIM );

export const taskFileLocationFromStr = ( str: string ): { filePath: string, location: TaskFileLocation } => {
    const [ filePath, sLine, sCol, sOffset, eLine, eCol, eOffset, parent ] = str.split( LOC_DELIM )
    const [ sl, sc, so ] = [ sLine, sCol, sOffset ].map( Number.parseInt )
    const [ el, ec, eo ] = [ eLine, eCol, eOffset ].map( Number.parseInt )
    return {
        filePath,
        location: {
            parent: Number.parseInt( parent ),
            position: {
                start: { line: sl, col: sc, offset: so },
                end: { line: el, col: ec, offset: eo }
            }
        }
    }
}

export const taskLocationStr = ( { filePath, position, parent }: TaskLocation ): string => [ filePath, posStr( position ) ].join( LOC_DELIM );

export const minTaskLocStr = ( { filePath, lineNumber }: MinTaskLocation ): string => [ filePath,
                                                                                        `${lineNumber}` ].join( LOC_DELIM );

export const emptyPosition = ( line: number ): Pos => pos( line, 0, 0, 0, 0, 0 );

export const taskLocFromStr = ( locationStr: string ): TaskLocation => {
    const [ filePath, parent, ...position ] = locationStr.split( LOC_DELIM );
    return {
        filePath,
        parent: Number.parseInt( parent ),
        position: pos( ...position.map( Number.parseInt ) )
    };
}

export const taskLocFromMinStr = ( locStr: string ): MinTaskLocation => {
    const [ filePath, lineNumber ] = locStr.split( LOC_DELIM );
    return { filePath, lineNumber: Number.parseInt( lineNumber ) }
}

export const locationsEqual = ( locA: TaskLocation, locB: TaskLocation ) => {
    return locA.filePath === locB.filePath && locA.position.start.line === locB.position.start.line;
};

export const positionsEqual = ( p1: Pos, p2: Pos ) => {
    return locsEqual( p1.start, p2.start );
}

export const locsEqual = ( l1: Loc, l2: Loc ) => {
    return l1.line === l2.line && l1.col === l2.col && l1.offset === l2.offset;
}
