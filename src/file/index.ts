import { CachedMetadata, TAbstractFile, TFile, TFolder, Vault } from 'obsidian';
import { Parser } from '../parse/Parser';
import { taskUidToId } from '../redux';
import { ParseOptions, PluginSettings } from '../redux/settings';
import { TaskRecordType } from './types';

export { taskToTaskFileContents } from './render';
export { taskAsChecklist } from './render';
export { taskFileLine } from './render';
export { taskToYamlObject } from './render';
export { TaskRecordType } from './types';
export { ITaskYamlObject } from './types';
export { YamlObject } from './types';
export { ITaskInstanceYamlObject } from './types';
export const taskToBasename = ( task: string, id: number ) => `${Parser.normalizeName( task )} (${taskUidToId( id )})`;
export const taskToFilename = ( task: string, id: number ) => `${taskToBasename( task, id )}.md`;

export const DEFAULT_TASKS_DIR = `tasks`;

export const removeTaskDataFromContents = ( contents: string, cache: CachedMetadata, parserOptions: ParseOptions ) => {
    const parser = new Parser( parserOptions );
    const taskItems = cache.listItems
        ?.filter( li => li.task ) || [];
    const lines = contents.split( '\n' );
    for ( const taskItem of taskItems ) {
        let taskLine = lines[ taskItem.position.start.line ];
        const task = parser.parseLine( taskLine );
        if ( task ) {
            // return line to normal
            taskLine = taskLine.replace( Parser.ID_REGEX, '' )
                .replace( Parser.FILE_LINK_REGEX, '' )
                .replace( /\s+(?<!^\s+)/, ' ' )
                .trimEnd();

            lines[ taskItem.position.start.line ] = taskLine;
        }
    }
    return lines.join( '\n' );
}

export const getVaultConfig = ( v: Vault ) => {
    return (v as Vault & { config: Record<string, boolean | number> }).config;
}

export const getTasksFolder = ( tasksDir: string, vault: Vault ) => {
    if ( !tasksDir )
        tasksDir = DEFAULT_TASKS_DIR;
    return vault.getAbstractFileByPath( tasksDir ) as TFolder;
}

export const isTaskFile = (
    cache: CachedMetadata,
): boolean => cache?.frontmatter &&
    cache.frontmatter.type &&
    cache.frontmatter.type === TaskRecordType;

export const deleteFileData = async (
    file: TAbstractFile,
    vault: Vault,
    cache: CachedMetadata,
    settings: PluginSettings
) => {
    if ( !file )
        return;
    if ( isTaskFile( cache ) ) {
        await vault.delete( file );
    }
    else {
        const contents = await vault.read( file as TFile )
        const removed = removeTaskDataFromContents( contents, cache, settings.parseOptions )
        await vault.modify( file as TFile, removed );
    }
}

export const getFile = async ( path: string, vault: Vault, create = false ) => {
    let ret = vault.getAbstractFileByPath( path );
    if ( !ret && create )
        ret = await vault.create( path, '' );
    return ret as TFile;
}
