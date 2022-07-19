import { CachedMetadata, Pos, TFile } from 'obsidian';
import { ITaskYamlObject } from '../file';
import { ITask, ITaskInstance } from '../redux/orm';
import { ParseOptions } from '../redux/settings';
import { LOC_DELIM, pos } from '../Task';
import { readTaskYaml, taskYamlFromFrontmatter } from './frontmatter';
import { Parser, TASK_BASENAME_REGEX } from './Parser';

export const parsePosStr = ( position: string ): Pos => pos( ...position.split( LOC_DELIM ).map( Number.parseInt ) )
export const parseTaskFilename = ( f: TFile ) => {
    const match = f.basename.match( TASK_BASENAME_REGEX );
    if ( !match )
        return null;
    const { name, id } = match.groups;
    return { name, id };
};
export { ParsedTask } from './types';

export const readTaskFile = (
    file: TFile,
    cache: CachedMetadata,
    data?: string
): ITask => {
    const taskYml: ITaskYamlObject = taskYamlFromFrontmatter( cache.frontmatter )
    const task = readTaskYaml( taskYml );
    task.name = task.name ?? file.basename;
    task.content = data && parseTaskContent(data, cache ).content || '';
    return task;
}

export const parseTaskContent = ( data: string, cache: CachedMetadata ): Partial<ITask> => {
    const { position: { start, end } } = cache.frontmatter;
    const contentStart = start?.line ?? 0;
    const contentEnd = end?.line ?? data.length - 1;
    return {
        content: data.slice( contentStart + 1, contentEnd )
    };
}

export const getFileInstances = (
    path: string,
    cache: CachedMetadata,
    contents: string,
    options: ParseOptions
): Record<number, ITaskInstance> => {
    if ( !cache.listItems )
        return {};
    const lines = contents.split( '\n' );
    const parser = Parser.create( options );
    const rec: Record<number, ITaskInstance> = {};
    for ( let i = 0; i < cache.listItems.length; i++ ) {
        const li = cache.listItems[ i ];
        if ( !li.task )
            continue;
        rec[ li.position.start.line ] = parser.fullParseLine( lines[ li.position.start.line ], path, li );
        let parent = li.parent;
        while ( parent > -1 ) {
            rec[ parent ] = parser.fullParseLine( lines[ parent ], path, li )
            parent = cache.listItems.find( li => li.position.start.line === parent ).parent;
        }
    }
    return rec;
}