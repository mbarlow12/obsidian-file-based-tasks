import { FrontMatterCache, ListItemCache } from 'obsidian';
import { IBaseTask, ITask, ITaskInstance } from '../orm';
import { DEFAULT_SETTINGS, ParseOptions } from '../settings';

export const parseInstanceYaml = ( yaml: string ): ITaskInstance => ({
    id: 0,
    name: '',
    complete: false,
    rawText: '',
    childLines: [],
    parentLine: -1,
    filePath: '',
    line: 0,
    links: [],
    tags: []
})
export const parseTaskFrontmatter = ( fm: FrontMatterCache ): ITask => {
    const {
        id,
        instances,
        dueDate,
        completed,
        tags,
        complete,
        childIds,
        parentIds,
        created,
        name
    } = fm;
    const base: IBaseTask = {
        id: Number.parseInt( id ),
        name,
        tags,
        content: '',
        complete: complete === 'true',
        created: new Date( created ).getTime(),
        childIds: (childIds || []).map( ( cid: string ) => Number.parseInt( cid ) ),
        parentIds: (parentIds || []).map( ( cid: string ) => Number.parseInt( cid ) )
    };
    if ( completed )
        base.completed = new Date( completed ).getTime();
    return {
        ...base,
        dueDate: new Date( dueDate ).getTime(),
        instances: instances.map( ( i: string ) => parseInstanceYaml( i ) )
    };
}

export const checkListRegex = /^(?<indent>\s*)[-*] \[(?<complete>.)]\s+/
// const idRegex = /\s+\^(?<id>[\w\d]+)$/;


export const parseLine = (
    line: string,
    path: string,
    lic: ListItemCache,
    parseOptions: ParseOptions = DEFAULT_SETTINGS.parseOptions
): ITaskInstance|null => {
    const checklistMatch = line.match( checkListRegex );
    if ( !checklistMatch )
        return null;
    // const { indent, complete } = checklistMatch;
    return null;
}
