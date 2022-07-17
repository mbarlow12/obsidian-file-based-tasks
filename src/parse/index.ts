import { Pos, TFile } from 'obsidian';
import { LOC_DELIM, pos } from '../Task';
import { TASK_BASENAME_REGEX } from './Parser';

export const parsePosStr = ( position: string ): Pos => pos( ...position.split( LOC_DELIM ).map( Number.parseInt ) )
export const parseTaskFilename = ( f: TFile ) => {
    const match = f.basename.match( TASK_BASENAME_REGEX );
    if ( !match )
        return null;
    const { name, id } = match.groups;
    return { name, id };
};
export { ParsedTask } from './types';
export { emptyPosition } from './Parser.test';