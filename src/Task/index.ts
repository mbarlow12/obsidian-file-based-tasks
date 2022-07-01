import { Loc, Pos } from "obsidian";
import { TaskFileLocation, TaskInstance, TaskLocation } from "./types";

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

export const parsePosStr = ( position: string ): Pos => pos( ...position.split( LOC_DELIM ).map( Number.parseInt ) )

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
export const taskFileLocationToStr = (
    filePath: string,
    { position, parent }: TaskFileLocation
): string => [
    filePath,
    `${parent}`,
    posStr( position )
].join( LOC_DELIM );

export const instanceIndexKey = ( filePath: string, line: number ) => [ filePath, line.toString() ].join( LOC_DELIM );

export const taskLocationStr = ( { filePath, line }: TaskLocation ): string => [
    filePath, `${line}`
].join( LOC_DELIM );

export const taskLocationStrFromInstance = ( {
    filePath,
    position: { start: { line } },
}: TaskInstance ) => taskLocationStr( { filePath, line } );

export const emptyPosition = ( line: number ): Pos => pos( line, 0, 0, 0, 0, 0 );

export const taskLocFromPosStr = ( locationStr: string ): TaskLocation => {
    const [ filePath, ...position ] = locationStr.split( LOC_DELIM );
    return {
        filePath,
        line: pos( ...position.map( Number.parseInt ) ).start.line
    };
}

export const locationsEqual = ( locA: TaskLocation, locB: TaskLocation ) => {
    return locA.filePath === locB.filePath && locA.line === locB.line;
};

export const positionsEqual = ( p1: Pos, p2: Pos ) => {
    return locsEqual( p1.start, p2.start );
}

export const locsEqual = ( l1: Loc, l2: Loc ) => {
    return l1.line === l2.line && l1.col === l2.col && l1.offset === l2.offset;
}
export const taskLocationFromInstance = (
    { filePath, position: { start: { line}} }: TaskInstance
): TaskLocation => taskLocation(filePath, line)

export const taskLocation = ( filePath: string, line: number ): TaskLocation => ({ filePath, line})