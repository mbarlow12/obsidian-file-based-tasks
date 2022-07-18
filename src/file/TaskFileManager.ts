import { CachedMetadata, MetadataCache, stringifyYaml, TFile, Vault } from "obsidian";
import path from 'path';
import { hashTaskInstance } from '../redux';
import { ITaskInstanceRecord } from '../redux/orm';
import { DEFAULT_RENDER_OPTS, PluginSettings } from '../redux/settings';
import { getVaultConfig } from './index';
import { renderTaskInstanceLinks, taskToYamlObject } from './render';

export const hashInstanceIndex = ( instances: ITaskInstanceRecord ): string =>
    Object.values(instances).sort(
        ( tA, tB ) => tA.line - tB.line )
        .map( hashTaskInstance )
        .join( '\n' );

export class TaskFileManager {
    private readonly vault: Vault;
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
            const inst = taskInstanceIdxFromTask( idxTask ).get( instancesKey( file.path, 0 ) );
            return new Map( [ [ instancesKey( file.path, 0 ), inst ] ] );
        }
        else
            return this.getFileInstances( file, cache, data );
    }

    public get tasksDirectory() {
        return this._tasksDirectory;
    }

    public async getFileHash( file: TFile, cache: CachedMetadata, contents: string ) {
        if ( this.isTaskFile( file ) ) {
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
            ].join( '\n' ) );
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
            ].join( '\n' );
            return this.vault.modify( file as TFile, newContents )
        }
    }

    public renderTaskInstance(
        instance: TaskInstance,
        pad = '',
        tasksDirPath = 'tasks',
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
}