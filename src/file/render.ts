import { MarkdownView, MetadataCache, stringifyYaml, TFile, Vault } from 'obsidian';
import path from 'path';
import { RRule } from 'rrule';
import { AppHelper } from '../helper';
import { taskUidToId } from '../store';
import { arraysEqual, instanceComparer, ITask, ITaskInstance, pathITaskInstances } from '../store/orm';
import { DEFAULT_RENDER_OPTS } from '../store/settings';
import { PluginState } from '../store/types';
import { getVaultConfig, taskToBasename, taskToFilename } from './index';
import { ITaskInstanceYamlObject, ITaskYamlObject, TaskRecordType } from './types';

export const renderTags = ( tags?: string[] ): string => (tags ?? []).join( ' ' );
export const renderRecurrence = ( rrule?: RRule ): string => rrule ? '&' + rrule.toText() : '';
export const renderDueDate = ( dueDate: Date ) => dueDate ? dueDate.toLocaleString() : '';

export const taskInstanceToChecklist = (
    { complete, name, id }: ITaskInstance
): string => [
    `- [${complete ? 'x' : ' '}]`, name, `^${taskUidToId( id )}`
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
        completed,
    } = task;
    return {
        type: TaskRecordType,
        id: `${id}`,
        name,
        complete: `${complete}`,
        created: new Date( created ).toISOString(),
        tags,
        dueDate: new Date( dueDate ).toISOString(),
        parentIds: parentIds.map( id => `${id}` ),
        childIds: childIds.map( id => `${id}` ),
        instances: instances.map( taskInstanceToYamlObject ),
        ...(completed && { completed: new Date( completed ).toISOString() })
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
    const app = AppHelper.app;
    renderOpts = AppHelper.plugin.settings.renderOptions;
    const taskLinks = (instance.links ?? [])
        .filter( l => !l.includes( instance.filePath ) && !instance.filePath.includes( l ) )
        .map( linkText => {
            const f = app.metadataCache.getFirstLinkpathDest( linkText, '' );
            return app.fileManager.generateMarkdownLink( f, '', '#^' + instance.id.toString( 16 ) )
        } )
    if ( renderOpts.primaryLink ) {
        const file = app.metadataCache.getFirstLinkpathDest( taskToFilename( instance.name, instance.id ), '' );
        taskLinks.push( app.fileManager.generateMarkdownLink( file, '' ) );
    }
    const instanceLine = [
        baseLine,
        ...((renderOpts.links || renderOpts.primaryLink) && taskLinks || []),
        renderOpts.id && `^${taskUidToId( instance.id )}` || ''
    ].join( ' ' ).trim();
    return pad + instanceLine;
}

export const getIndent = ( instance: ITaskInstance, useTab = false, tabSize = 4 ) => {
    const rawPad = instance.rawText.match( /^\s+/ );
    if ( rawPad )
        return rawPad[ 0 ];

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

export const writeTask = async (
    task: ITask,
    vault: Vault,
    mdCache: MetadataCache,
    taskDirPath = 'tasks',
    init = false
) => {
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
        const { mtime } = (file as TFile).stat;
        await vault.modify( file as TFile, newContents )
        if ( init )
            (file as TFile).stat.mtime = mtime;
        return
    }
}

export const writeState = async (
    file: TFile,
    newState: PluginState,
    init = false,
) => {
    const { app: { metadataCache, workspace }, plugin } = AppHelper;
    const { orm, state, settings } = plugin;
    const { useTab, tabSize } = getVaultConfig( file.vault );
    const instances = pathITaskInstances( newState.taskDb, orm )( file.path );
    const currentInstances = plugin.selectFileInstances( state.taskDb, file.path );
    const isIndex = file.path in settings.indexFiles;
    const cache = metadataCache.getFileCache( file );
    const cursorLine = workspace.getActiveViewOfType(MarkdownView).editor.getCursor().line;
    if ( !arraysEqual( instances, currentInstances, instanceComparer ) || isIndex ) {
        const lines = isIndex ?
                      new Array( instances.length ).fill( '' ) :
                      (await file.vault.read( file )).split( '\n' );
        for ( let i = 0; i < instances.length; i++ ) {
            const inst = instances[ i ];
            if ( inst.id === -1 )
                continue;
            lines[ inst.line ] = renderTaskInstance( inst, getIndent( inst, useTab as boolean, tabSize as number ) )
        }
        if ( !isIndex ) {
            const taskItems = cache.listItems.filter( li => li.task );
            for ( let i = 0; i < taskItems.length; i++ ) {
                const { line } = taskItems[ i ].position.start;
                if (line === cursorLine)
                    continue;
                if ( !instances.find( newInst => newInst.line === line ) )
                    lines[ line ] = '';
            }
        }
        const { mtime } = file.stat;
        await file.vault.modify( file, lines.join( '\n' ) );
        if ( init )
            file.stat.mtime = mtime;
    }
    return instances;
}

export const writeIndexFile = async (
    file: TFile,
    newState: PluginState,
) => {
    return writeState( file, newState);
}