import { MetadataCache, stringifyYaml, TFile, Vault } from 'obsidian';
import path from 'path';
import { ORM } from 'redux-orm';
import { RRule } from 'rrule';
import { arraysEqual, instanceComparer, ITask, ITaskInstance, pathITaskInstances, TaskORMSchema } from '../redux/orm';
import { DEFAULT_RENDER_OPTS } from '../redux/settings';
import { PluginState } from '../redux/types';
import { getVaultConfig, taskToBasename, taskToFilename } from './index';
import { ITaskInstanceYamlObject, ITaskYamlObject, TaskRecordType } from './types';

export const renderTags = ( tags?: string[] ): string => (tags ?? []).join( ' ' );
export const renderRecurrence = ( rrule?: RRule ): string => rrule ? '&' + rrule.toText() : '';
export const renderDueDate = ( dueDate: Date ) => dueDate ? dueDate.toLocaleString() : '';

export const taskInstanceToChecklist = ( { complete, name, id }: ITaskInstance ): string => [
    `- [${complete ? 'x' : ' '}]`, name,
    `^${id}`
].join( ' ' );


export const renderTaskInstanceLinks = ( task: ITask ) => {
    return task.instances
        .filter( loc => !loc.filePath.includes( taskToBasename( task.name, task.id ) ) )
        .map( loc => `[[${loc.filePath}]]` ).join( ' ' );
};
export const taskToYamlObject = ( task: ITask ): ITaskYamlObject => {
    const {
        id,
        name,
        complete,
        created,
        tags,
        dueDate,
        parentIds,
        childIds,
        instances,
        completedDate,
    } = task;
    return {
        type: TaskRecordType,
        id: `${id}`,
        name,
        complete: `${complete}`,
        created: created.toISOString(),
        tags,
        dueDate: dueDate.toISOString(),
        parentIds: parentIds.map( id => `${id}` ),
        childIds: childIds.map( id => `${id}` ),
        instances: instances.map( taskInstanceToYamlObject ),
        ...(completedDate && { completedDate: completedDate.toISOString() })
    };
}
export const taskToTaskFileContents = ( task: ITask ): string => {
    const yamlObject = taskToYamlObject( task );
    const data = `---\n${stringifyYaml( yamlObject )}---\n${task.content || ''}`;
    return `${data}\n\n\n---\n${renderTaskInstanceLinks( task )}`;
}
export const taskAsChecklist = ( t: Pick<ITaskInstance, 'id' | 'name' | 'complete'> ) => `- [${t.complete
                                                                                               ? 'x'
                                                                                               : ' '}] ${t.name} ^${t.id}`;
export const taskFileLine = ( t: ITaskInstance, offset = 0 ) => new Array( offset ).fill( ' ' )
    .join( '' ) + taskAsChecklist( t );

export const taskInstanceToYamlObject = ( inst: ITaskInstance ): ITaskInstanceYamlObject => {
    const {
        complete,
        rawText,
        filePath,
        line,
        parentLine,
        childLines,
        links
    } = inst;
    return {
        rawText,
        filePath,
        line: `${line}`,
        parentLine: `${parentLine}`,
        complete: complete.toString(),
        childLines: childLines.map( l => `${l}` ),
        links
    }
}

export const renderTaskInstance = (
    instance: ITaskInstance,
    pad = '',
    tasksDirPath = 'tasks',
    renderOpts = DEFAULT_RENDER_OPTS
): string => {
    const baseLine = taskInstanceToChecklist( instance ).replace( /\^[\w\d]+/, '' ).trim();
    const taskLinks = (instance.links ?? [])
        .filter( l => !l.includes( instance.filePath ) && !instance.filePath.includes( l ) )
        .map( link => `[[${link}#^${instance.id}|${path.parse( link ).name}]]` )
    if ( renderOpts.primaryLink )
        taskLinks.push( `[[${path.join( tasksDirPath, taskToFilename( instance.name, instance.id ) )}]]` );
    const instanceLine = [
        baseLine,
        ...((renderOpts.links || renderOpts.primaryLink) && taskLinks || []),
        renderOpts.id && `^${instance.id}` || ''
    ].join( ' ' );
    return pad + instanceLine;
}

export const getIndent = ( instance: ITaskInstance, useTab = false, tabSize = 4 ) => {
    const rawPad = instance.rawText.match(/^\s+/);
    if (rawPad)
        return rawPad[0];

    let pad = '';
    let { parentLine, parentInstance } = instance;
    while ( parentLine > -1 && parentInstance ) {
        pad = pad.padStart( pad.length + tabSize, useTab ? '\t' : ' ' );
        ({ parentLine, parentInstance } = parentInstance);
    }
    return pad;
}

export const taskFullPath = ( task: ITask | ITaskInstance | string, id?: number, dir = 'tasks' ) => {
    if ( typeof task !== 'string' ) {
        id = task.id;
        task = task.name;
    }
    return path.join( dir, taskToFilename( task, id ) )
}

export const writeTask = async ( task: ITask, vault: Vault, mdCache: MetadataCache, taskDirPath = 'tasks' ) => {
    /*
     TODO: consider adding a completed folder to declutter the tasks directory
     - and an archived folder
     */
    const fullPath = taskFullPath( task.name, task.id, taskDirPath );
    const file = vault.getAbstractFileByPath( fullPath );
    const yaml = taskToYamlObject( task );
    const links = renderTaskInstanceLinks( task );
    if ( !file ) {
        return vault.create( fullPath, [
            '---',
            stringifyYaml( yaml ) + '---',
            '\n',
            'Links',
            '---',
            links
        ].join( '\n' ) );
    }
    else {
        const cache = mdCache.getFileCache( file as TFile );
        const contents = await vault.cachedRead( file as TFile );
        const lines = contents.split( '\n' );
        const descStart = cache && cache.frontmatter?.position.end.line + 1;
        const descEnd = cache && cache.headings?.find( s => s.heading.toLowerCase()
            .includes( 'links' ) )?.position.start.line;
        const description = lines.slice( descStart, descEnd || lines.length - 1 ).join( '\n' ).trim();
        const newContents = [
            '---',
            stringifyYaml( yaml ) + '---',
            description,
            '### Links',
            links
        ].join( '\n' );
        return await vault.modify( file as TFile, newContents )
    }
}

export const writeState = async (
    file: TFile,
    vault: Vault,
    state: PluginState,
    orm: ORM<TaskORMSchema>,
    currentInstances: ITaskInstance[],
    isIndex = false,
) => {
    const { useTab, tabSize } = getVaultConfig( vault );
    const instances = pathITaskInstances( state.taskDb, orm )( file.path );
    if ( !arraysEqual( instances, currentInstances, instanceComparer ) ) {
        const lines = isIndex ?
                      new Array( instances.length ).fill( '' ) :
                      (await vault.read( file )).split( '\n' );
        for ( let i = 0; i < instances.length; i++ ) {
            const inst = instances[ i ];
            if ( inst.id === -1 )
                continue;
            lines[ inst.line ] = renderTaskInstance( inst, getIndent( inst, useTab as boolean, tabSize as number ) )
        }
        await vault.modify( file, lines.join( '\n' ) );
    }
    return instances;
}

export const writeIndexFile = async (
    file: TFile,
    vault: Vault,
    state: PluginState,
    orm: ORM<TaskORMSchema>,
    currentInstances: ITaskInstance[]
) => {
    return writeState( file, vault, state, orm, currentInstances, true );
}