import { CachedMetadata, FrontMatterCache, MetadataCache, stringifyYaml, TAbstractFile, TFile, Vault } from "obsidian";
import path from 'path';
import { Parser, ParserSettings } from '../parse/Parser';
import { PluginSettings } from '../pluginSettings';
import { hashTaskInstance } from '../redux';
import { emptyTaskInstance } from '../redux/orm';
import { DEFAULT_RENDER_OPTS, PluginSettings } from '../redux/settings';
import { filterIndexByPath } from '../Store';
import { taskInstanceIdxFromTask, taskInstanceToChecklist } from "../Store/TaskStore";
import { TaskInstanceIndex } from '../Store/types';
import { hashTask, instancesKey, readTaskYaml, Task, TaskInstance } from "../Task";
import { taskToFilename } from './index';
import { renderTaskInstanceLinks, taskToYamlObject } from './render';
import { TaskRecordType, TaskYamlObject } from './types';

export interface FileManagerSettings {
    taskDirectoryName: string,
    backlogFileName: string,
    completedFileName: string,
}

export const hashInstanceIndex = ( instances: TaskInstanceIndex ): string =>
    [ ...instances.values() ].sort(
        ( tA, tB ) => tA.position.start.line - tB.position.start.line )
        .map( hashTaskInstance )
        .join( '\n' );

export enum CacheStatus {
    CLEAN = 'CLEAN',
    DIRTY = 'DIRTY',
    UNKNOWN = 'UNKNOWN',
}

export interface FileState {
    status: CacheStatus;
    hash: string;
}

export interface RenderOpts {
    id: boolean,
    links: boolean,
    tags: boolean,
    recurrence: boolean,
    dueDate: boolean,
    completedDate: boolean,
    strikeThroughOnComplete: boolean,
}

export const getVaultConfig = ( v: Vault ) => {
    return (v as Vault & { config: Record<string, boolean | number> }).config;
}

export const DEFAULT_TASKS_DIR = `tasks`;

export class TaskFileManager {
    private vault: Vault;
    private mdCache: MetadataCache;
    private settings: PluginSettings;

    constructor(
        vault: Vault,
        cache: MetadataCache,
    ) {
        this.vault = vault;
        this.mdCache = cache;
    }

    public async updateSettings( settings: PluginSettings ) {
    }

    public async getInstanceIndexFromFile( file: TFile, cache: CachedMetadata, data: string ) {
        if ( this.isTaskFile( file ) ) {
            const idxTask = await this.readTaskFile( file, cache, data );
            const inst = taskInstanceIdxFromTask( idxTask ).get(instancesKey(file.path, 0));
            return new Map([[instancesKey(file.path, 0), inst]]);
        }
        else
            return this.getFileInstances( file, cache, data );
    }

    public get tasksDirectory() {
        return this._tasksDirectory;
    }

    public async getFileHash(file: TFile, cache: CachedMetadata, contents: string) {
        if (this.isTaskFile(file)) {
            const task = await this.readTaskFile( file, cache, contents );
            return hashTask( task );
        }
        const idx = await this.getFileInstances( file, cache, contents );
        return hashInstanceIndex( idx );
    }

    public async storeTaskFile( task: Task ) {
        /*
         TODO: consider adding a completed folder to declutter the tasks directory
         */
        const fullPath = this.getTaskPath( task );
        const file = this.vault.getAbstractFileByPath( fullPath );
        const yaml = taskToYamlObject( task );
        const links = renderTaskInstanceLinks( task );
        if ( !file ) {
            return this.vault.create( fullPath, [
                '---',
                stringifyYaml( yaml ) + '---',
                '\n',
                'Links',
                '---',
                links
            ].join('\n') );
        }
        else {
            const cache = this.mdCache.getFileCache( file as TFile );
            const contents = await this.vault.cachedRead( file as TFile );
            const lines = contents.split( '\n' );
            const descStart = cache && cache.frontmatter?.position.end.line + 1;
            const descEnd = cache && cache.sections?.find( s => s.type === 'heading' )?.position.start.line;
            const description = lines.slice( descStart, descEnd || lines.length - 1 ).join( '\n' ).trim();
            const newContents = [
                '---',
                stringifyYaml( yaml ) + '---',
                description,
                'Links',
                '---',
                links
            ].join('\n');
            return this.vault.modify( file as TFile, newContents )
        }
    }

    public isTaskFile( file: TFile, cache?: CachedMetadata ): boolean {
        cache = cache ?? this.mdCache.getFileCache( file );
        return file.parent === this.tasksDirectory &&
            cache?.frontmatter &&
            cache.frontmatter.type &&
            cache.frontmatter.type === TaskRecordType;
    }

    private static taskYamlFromFrontmatter( cfm: FrontMatterCache ): TaskYamlObject {
        const {
            type,
            id,
            uid,
            name,
            locations,
            complete,
            created,
            updated,
            parentUids,
            childUids,
            recurrence,
            dueDate,
            completedDate
        } = cfm;
        return {
            type,
            id,
            uid,
            name,
            locations,
            complete,
            created,
            updated,
            parentUids,
            childUids,
            recurrence,
            dueDate,
            completedDate
        } as unknown as TaskYamlObject
    }

    public async readTaskFile( file: TFile, cache?: CachedMetadata, data?: string ): Promise<Task> {
        cache = cache ?? this.mdCache.getFileCache( file );
        const taskYml: TaskYamlObject = TaskFileManager.taskYamlFromFrontmatter( cache.frontmatter )
        const task = readTaskYaml( taskYml );
        task.name = task.name ?? file.basename;
        task.description = '';
        return task;
    }

    public async readMarkdownFile( file: TFile ): Promise<TaskInstanceIndex> {
        const cache = this.mdCache.getFileCache( file );
        const contents = await this.vault.read( file );
        return this.getFileInstances( file, cache, contents );
    }

    public getFileInstances( file: TFile, cache: CachedMetadata, contents: string ): TaskInstanceIndex {
        const contentLines = contents.split( /\r?\n/ );

        const fileIndex: TaskInstanceIndex = new Map();
        const cacheTasks = (cache?.listItems ?? []).filter( li => li.task );
        for ( let i = 0; i < (cacheTasks || []).length; i++ ) {
            const lic = cacheTasks[ i ];
            const taskInstance = this.parser.fullParseLine( contentLines[ lic.position.start.line ], file.path, lic );
            if ( !taskInstance )
                continue;
            fileIndex.set( instancesKey( file.path, lic.position.start.line ), taskInstance );
            if ( taskInstance.parent > -1 && !this.parser.parseLine( contentLines[ taskInstance.parent ] ) ) {
                let parentLine = taskInstance.parent;
                while ( parentLine > -1 ) {
                    const parentListItem = cache.listItems.find( pLic => pLic.position.start.line === parentLine );
                    if ( parentListItem && !parentListItem.task ) {
                        let parentTaskInstnace = this.parser.parseListItemLine( contentLines[ parentLine ], file.path, parentListItem );
                        if ( !parentTaskInstnace )
                            parentTaskInstnace = {
                                ...emptyTaskInstance(),
                                name: 'empty parent',
                                filePath: file.path,
                                position: { ...parentListItem.position },
                                parent: parentListItem.parent,
                            };
                        fileIndex.set(
                            instancesKey( file.path, parentListItem.position.start.line ),
                            parentTaskInstnace
                        )
                    }
                    parentLine = parentListItem ? parentListItem.parent : -1;
                }
            }
        }
        return fileIndex;
    }

    public async getTaskFiles() {
        return this.vault.getMarkdownFiles().filter( f => f.parent === this.tasksDirectory );
    }

    public renderTaskInstance(
        instance: TaskInstance,
        pad = '',
        renderOpts = DEFAULT_RENDER_OPTS
    ): string {
        const baseLine = taskInstanceToChecklist( instance ).replace( /\^[\w\d]+/, '' ).trim();
        const taskLinks = (instance.links ?? [])
            .filter( l => !l.includes( instance.filePath ) && !instance.filePath.includes( l ) )
            .map( link => `[[${link}#^${instance.id}|${path.parse( link ).name}]]` )
        const instanceLine = [
            baseLine,
            ...(renderOpts.links && taskLinks || []),
            `[[${this.getTaskPath( instance )}]]`,
            renderOpts.id && `^${instance.id}` || ''
        ].join( ' ' );
        return pad + instanceLine;
    }

    public async writeIndexFile(
        file: TFile,
        instanceIndex: TaskInstanceIndex,
    ): Promise<void> {
        instanceIndex = filterIndexByPath( file.path, instanceIndex );
        const lines = new Array( instanceIndex.size ).fill( '' );
        for ( const inst of instanceIndex.values() )
            lines[ inst.position.start.line ] =
                this.renderTaskInstance( inst, this.getIndent( inst, instanceIndex ) );
        await this.vault.modify( file, lines.join( '\n' ) );
    }

    private getIndent( instance: TaskInstance, index: TaskInstanceIndex ) {
        let { useTab, tabSize } = getVaultConfig( this.vault );
        useTab ||= false;
        tabSize = tabSize as number || (useTab ? 1 : 4);
        let pad = '';
        let parent = instance.parent;
        while ( parent > -1 ) {
            pad = pad.padStart( pad.length + tabSize, useTab ? '\t' : ' ' );
            const p = index.get( instancesKey( instance.filePath, parent ) );
            parent = p.parent;
        }
        return pad;
    }

    public async writeStateToFile( file: TFile, instanceIndex: TaskInstanceIndex ): Promise<void> {
        const filteredIndex = filterIndexByPath( file.path, instanceIndex );
        const renderedIndex = await this.readMarkdownFile( file );
        const contents = (await this.vault.read( file ));
        const contentLines = contents.split( '\n' );

        for ( const [ key, instance ] of renderedIndex ) {
            if ( !filteredIndex.has( key ) && instance.uid !== 0 )
                contentLines[ instance.position.start.line ] = '';
        }
        for ( const instance of filteredIndex.values() ) {
            contentLines[ instance.position.start.line ] =
                this.renderTaskInstance(
                    instance,
                    this.getIndent( instance, filteredIndex )
                );
        }
        await this.vault.modify( file, contentLines.join( '\n' ) )
    }

    public getTaskPath( task: Task | TaskInstance ): string {
        return `${this.tasksDirectory.path}/${taskToFilename( task )}`;
    }

    public async deleteFile( file: TAbstractFile ) {
        if ( !file )
            return;
        if ( file instanceof TFile ) {
            if ( this.isTaskFile( file ) )
                await this.vault.delete( file )
            else {
                await this.removeTaskMetadata( file );
            }
        }
    }

    public async removeTaskMetadata(
        file: TFile,
        vault = this.vault,
        mdCache = this.mdCache,
        parserSettings = this.pluginSettings.parserSettings
    ) {
        return TaskFileManager.removeTaskMetadata( file, vault, mdCache, parserSettings );
    }

    public static async removeTaskMetadata(
        file: TFile,
        vault: Vault,
        mdCache: MetadataCache,
        parserSettings: ParserSettings
    ) {
        return vault.read( file )
            .then( contents => {
                const parser = new Parser( parserSettings );
                const taskItems = mdCache.getFileCache( file )?.listItems
                    ?.filter( li => li.task ) || [];
                const lines = contents.split( '\n' );
                for ( const taskItem of taskItems ) {
                    let taskLine = lines[ taskItem.position.start.line ];
                    const task = parser.parseLine( taskLine );
                    if ( task ) {
                        // return line to normal
                        taskLine = taskLine.replace( Parser.ID_REGEX, '' )
                            .replace(Parser.FILE_LINK_REGEX, '')
                            .replace( parser.recurrenceRegex, '' )
                            .replace( parser.dueDateRegex, '' )
                            .replace(/\s+(?<!^\s+)/, ' ')
                            .trimEnd();

                        lines[ taskItem.position.start.line ] = taskLine;
                    }
                }
                const stripped = lines.join( '\n' );
                return vault.modify( file, stripped );
            } )
    }

    async getFile( path: string ) {
        let ret = this.vault.getAbstractFileByPath( path );
        if ( !ret )
            ret = await this.vault.create( path, '' );
        return ret as TFile;
    }
}