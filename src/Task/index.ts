import { Loc, Pos } from "obsidian";

export const LOC_DELIM = '||';

export const loc = ( line: number, col: number, offset: number ): Loc => ({ line, col, offset });

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