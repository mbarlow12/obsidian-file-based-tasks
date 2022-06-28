import { keys, values } from 'lodash';
import {
    CachedMetadata,
    EventRef,
    FrontMatterCache,
    MetadataCache,
    TAbstractFile,
    TFile,
    TFolder,
    Vault
} from "obsidian";
import { TaskEvents } from "./Events/TaskEvents";
import { EventType } from './Events/types';
import { TaskParser } from './Parser/TaskParser';
import { DEFAULT_TASK_MANAGER_SETTINGS } from './Settings';
import { hashTaskInstance, taskInstancesFromTask, taskInstanceToChecklist } from "./Store/TaskStore";
import { TaskIndex, TaskInstanceIndex, TaskStoreState } from './Store/types';
import {
    getTaskFromYaml,
    hashTask,
    instanceIndexKey,
    parseTaskFilename,
    Task,
    TaskInstance,
    taskLocationStr,
    taskLocationStrFromInstance,
    TaskRecordType,
    taskToFilename,
    taskToTaskFileContents,
    TaskYamlObject
} from "./Task";
import { instancesLocationsEqual, isPrimaryInstance } from './Task/Task';
import { TaskManagerSettings } from './taskManagerSettings';

export interface FileManagerSettings {
    taskDirectoryName: string,
    backlogFileName: string,
    completedFileName: string,
}

export const DEFAULT_FILE_MANAGER_SETTINGS: FileManagerSettings = {
    taskDirectoryName: 'tasks',
    backlogFileName: 'Backlog.md',
    completedFileName: 'Complete.md'
}

export const hashFileTaskState = ( state: TaskInstanceIndex ): string =>
    values( state )
        .sort( ( tA, tB ) => tA.position.start.line - tB.position.start.line )
        .map( hashTaskInstance )
        .join( '\n' );

export const filterIndexByPath = ( filePath: string, index: TaskInstanceIndex ): TaskInstanceIndex =>
    values( index )
        .filter( s => s.filePath === filePath )
        .reduce( ( fst, inst ) => ({ ...fst, [ taskLocationStr( inst ) ]: inst }), {} )

export enum CacheStatus {
    CLEAN = 'CLEAN',
    DIRTY = 'DIRTY',
    UNKNOWN = 'UNKNOWN',
}

export interface FileState {
    status: CacheStatus;
    hash: string;
}

export const getVaultConfig = ( v: Vault ) => {
    return (v as Vault & { config: Record<string, boolean | number> }).config;
}

export class TaskFileManager {
    private tasksDirString: string;
    private _backlogFileName: string;
    private _completedFileName: string;
    private _backlogFile: TFile;
    private _completeFile: TFile;
    private _tasksDirectory: TFolder;
    private vault: Vault;
    private mdCache: MetadataCache;
    private events: TaskEvents;
    private taskStoreEventRef: EventRef;
    private fileStates: Record<string, FileState>;
    private parser: TaskParser;
    private eventRefs: Map<EventType, EventRef>;
    private settings: FileManagerSettings;
    private pluginSettings: TaskManagerSettings;
    private taskStoreState: TaskStoreState;

    constructor(
        vault: Vault,
        cache: MetadataCache,
        events: TaskEvents,
        parser = new TaskParser(),
        settings = DEFAULT_TASK_MANAGER_SETTINGS
    ) {
        this.vault = vault;
        this.mdCache = cache;
        this.events = events;
        this.parser = parser;
        this.eventRefs = new Map();
        this.pluginSettings = settings;
        this.settings = settings.fileManagerSettings;
        this.eventRefs.set(
            EventType.INDEX_UPDATED,
            this.events.registerIndexUpdatedHandler( this.handleIndexUpdate.bind( this ) )
        );
        this.eventRefs.set(
            EventType.SETTINGS_UPDATE,
            this.events.onSettingsUpdate( this.updateSettings.bind( this ) )
        );
        this.tasksDirString = settings.taskDirectoryName;
        this._backlogFileName = settings.backlogFileName;
        this._completedFileName = settings.completedFileName;
        this._tasksDirectory = this.vault.getAbstractFileByPath( settings.taskDirectoryName ) as TFolder;
        this.fileStates = {};
        if ( !this._tasksDirectory ) {
            this.vault.createFolder( settings.taskDirectoryName )
                .then( () => {
                    this._tasksDirectory = this.vault.getAbstractFileByPath( settings.taskDirectoryName ) as TFolder;
                } );
        }
        this._backlogFile = this.vault.getAbstractFileByPath( settings.backlogFileName ) as TFile;
        if ( !this._backlogFile ) {
            this.vault.create( settings.backlogFileName, '' )
                .then( backlog => {
                    this._backlogFile = backlog;
                } );
        }
        this._completeFile = this.vault.getAbstractFileByPath( settings.completedFileName ) as TFile;
        if ( !this._completeFile ) {
            this.vault.create( settings.completedFileName, '' )
                .then( completed => {
                    this._completedFileName = completed.name;
                    this._completeFile = completed;
                } )
        }

    }

    async getBacklogFile() {
        if ( !this._backlogFile ) {
            this._backlogFile = await this.vault.create( this._backlogFileName, '' );
        }
        return this._backlogFile;
    }

    async getCompletedFile() {
        if ( !this._completeFile ) {
            this._completeFile = await this.vault.create( this._completedFileName, '' );
        }
        return this._completeFile;
    }

    public async updateSettings( settings: TaskManagerSettings ) {
        this.settings = settings.fileManagerSettings;
    }

    public async handleIndexUpdate( state: TaskStoreState ) {
        this.taskStoreState = state;

        const { instanceIndex, taskIndex } = this.taskStoreState;

        const taskFilePaths = this.tasksDirectory.children.map( c => c.path );
        for ( const taskId in taskIndex ) {
            const idxTask = taskIndex[ taskId ];
            const newTaskHash = await hashTask( idxTask );
            const taskFilePath = this.getTaskPath( idxTask )
            taskFilePaths.remove( taskFilePath );
            if (
                taskFilePath in this.fileStates &&
                this.fileStates[ taskFilePath ].hash === newTaskHash
            ) continue;
            this.fileStates[ taskFilePath ] = {
                status: CacheStatus.DIRTY,
                hash: newTaskHash
            };
            await this.storeTaskFile( idxTask );
        }
        for ( const tfp in taskFilePaths )
            await this.deleteFile( this.vault.getAbstractFileByPath( tfp ) );

        const filePaths = values( instanceIndex ).filter( inst => !isPrimaryInstance( inst ) )
            .map( inst => inst.filePath )
            .filter( ( fp, i, arr ) => arr.indexOf( fp ) === i );

        // update note files
        for ( const path of filePaths ) {
            const newFileInstanceIndex = filterIndexByPath( path, instanceIndex );
            const newHash = hashFileTaskState( newFileInstanceIndex );
            if ( path in this.fileStates && this.fileStates[ path ].hash === newHash )
                continue
            let file = this.vault.getAbstractFileByPath( path ) as TFile;
            if ( !file )
                file = await this.vault.create( path, '' );
            this.fileStates[ file.path ] = {
                hash: newHash,
                status: CacheStatus.DIRTY,
            }
            let hash: string;
            if ( this.pluginSettings.indexFiles.has( file.path ) )
                hash = await this.writeIndexFile( file, instanceIndex, taskIndex )
            else
                hash = await this.writeStateToFile( file, this.taskStoreState );

            if ( hash !== newHash )
                throw Error( `Something went wrong when hashing the state for ${file.path}` )

        }

        // delete task files no longer found in the store
        const activeFilePaths = new Set( values( instanceIndex ).map( i => i.filePath ) );
        const cacheFilePaths = new Set( keys( this.fileStates ) );
        for ( const cachePath of cacheFilePaths ) {
            if ( !activeFilePaths.has( cachePath ) )
                await this.deleteFile( this.vault.getAbstractFileByPath( cachePath ) );
        }
    }

    public async getInstanceIndexFromFile( file: TFile, cursorLine?: number ) {
        let state: TaskInstanceIndex;
        if ( this.isTaskFile( file ) ) {
            const idxTask = await this.readTaskFile( file );
            state = taskInstancesFromTask( idxTask ).reduce( ( idx, inst ) => ({
                ...idx,
                [ taskLocationStrFromInstance( inst ) ]: inst
            }), {} );
        }
        else {
            state = await this.readMarkdownFile( file )
            if ( cursorLine ) {
                const cursorKey = instanceIndexKey( file.path, cursorLine );
                if ( cursorKey in state && state[ cursorKey ].uid === 0 )
                    delete state[ cursorKey ];
            }
        }
        const newHash = hashFileTaskState( state );
        this.fileStates[ file.path ] = {
            ...(this.fileStates[ file.path ] || { status: CacheStatus.CLEAN, hash: null }),
            hash: newHash
        };
        return state;
    }

    public get tasksDirectory() {
        return this._tasksDirectory;
    }

    public set tasksDirectory( dir: TFolder ) {
        this._tasksDirectory = dir;
    }

    public getFileStateHash( path: string ): FileState {
        return (path in this.fileStates && this.fileStates[ path ]) || { status: CacheStatus.DIRTY, hash: null };
    }

    public updateTaskDirectoryName( name: string ) {
        this.tasksDirString = name;
        this.vault.rename( this._tasksDirectory, name )
            .then( () => {
                this._tasksDirectory = this.vault.getAbstractFileByPath( name ) as TFolder;
            } );
    }

    public getTaskFile( name: string ): TFile {
        if ( name.endsWith( '.md' ) )
            name = name.slice( 0, name.length - 3 );
        return this.mdCache.getFirstLinkpathDest( name, this._tasksDirectory.path );
    }

    public async storeTaskFile( task: Task ) {
        const fullPath = this.getTaskPath( task );
        const file = this.vault.getAbstractFileByPath( fullPath );
        if ( !file ) {
            return this.vault.create( fullPath, taskToTaskFileContents( task ) );
        }
        else {
            return this.vault.modify( file as TFile, taskToTaskFileContents( task ) )
        }
    }

    public isTaskFile( file: TFile ): boolean {
        const pathParts = file.path.split( '/' );
        if ( pathParts.length < 2 )
            return false;
        const parent = file.parent;
        if ( parent !== this.tasksDirectory )
            return false;
        const { name, id } = parseTaskFilename( file );
        if ( !(name && id) )
            return false;
        const cache = this.mdCache.getFileCache( file );
        if ( cache ) {
            return (
                cache.frontmatter && cache.frontmatter.type &&
                cache.frontmatter.type === TaskRecordType
            );
        }
        return true;
    }

    private static taskYamlFromFrontmatter( cfm: FrontMatterCache ): TaskYamlObject {
        const {
            type, id, uid, name, instances, complete, created, updated, parentUids, childUids, recurrence, dueDate
        } = cfm;
        return {
            type, id, uid, name, instances, complete, created, updated, parentUids, childUids, recurrence, dueDate
        } as unknown as TaskYamlObject
    }

    public async readTaskFile( file: TFile ): Promise<Task> {
        const cache = this.mdCache.getFileCache( file );
        const taskYml: TaskYamlObject = TaskFileManager.taskYamlFromFrontmatter( cache.frontmatter )
        const task = getTaskFromYaml( taskYml );
        task.name = task.name ?? file.basename;
        const contentStart = cache.frontmatter.position.end.line + 1;
        task.description = await this.vault.read( file )
            .then( data => data.split( '\n' ).slice( contentStart ) )
            .then( lines => lines.join( '\n' ) );
        return task;
    }

    public async readMarkdownFile( file: TFile ): Promise<TaskInstanceIndex> {
        const cache = this.mdCache.getFileCache( file );
        const contents = await this.vault.read( file );
        return this.getFileInstanceIndex( file, cache, contents );
    }

    public getFileInstanceIndex( file: TFile, cache: CachedMetadata, contents: string ): TaskInstanceIndex {
        const contentLines = contents.split( /\r?\n/ );

        return (cache.listItems || []).filter( li => li.task )
            .reduce( ( instIdx, lic ) => {
                const task = this.parser.parseLine( contentLines[ lic.position.start.line ] );
                if ( !task )
                    return instIdx;
                const locStr = taskLocationStr( { filePath: file.path, position: lic.position, parent: lic.parent } );
                return {
                    ...instIdx,
                    [ locStr ]: {
                        ...task,
                        primary: false,
                        filePath: file.path,
                        parent: lic.parent,
                        position: { ...lic.position }
                    }
                }
            }, {} as TaskInstanceIndex )
    }

    public async getTaskFiles() {
        return this.vault.getMarkdownFiles().filter( f => f.parent === this.tasksDirectory );
    }

    public renderTaskInstance(
        instance: TaskInstance,
        taskIndex: TaskIndex,
        instanceIndex: TaskInstanceIndex,
        links = false
    ): string {
        let { useTab, tabSize } = getVaultConfig( this.vault );
        tabSize ||= 4;
        useTab ||= false;
        const baseLine = taskInstanceToChecklist( instance ).replace( /\^[\w\d]+/, '' ).trim();
        const taskLinks = taskIndex[ instance.uid ].instances.filter( i =>
            i.filePath !== instance.filePath && !instancesLocationsEqual( i, instance )
        )
            .map( inst => {
                const file = this.vault.getAbstractFileByPath( inst.filePath ) as TFile;
                if ( !file )
                    console.log( `file path for ${inst.name} at ${inst.filePath} not found` );
                const text = this.mdCache.fileToLinktext( file, inst.filePath );
                return `[[${text}#^${inst.id}|${inst.name}]]`
            } );
        const instanceLine = [ baseLine, ...(links && taskLinks || []), `^${instance.id}` ].join( ' ' );
        const colSize = useTab ? 1 : tabSize as number;
        const parent = instance.parent > -1 && instanceIndex[ instanceIndexKey( instance.filePath, instance.parent ) ];
        // for some reason, regardless of tabSize, Obsidian always has the first col as 2
        // if that's the case, need to explicitly override it for proper formatting
        const colFromParent = parent && Math.ceil( (parent.position.start.col || 0) / colSize ) * colSize + colSize || 0
        const col = instance.position.start.col || (parent && colFromParent) || 0;
        return instanceLine.padStart( instanceLine.length + Math.ceil( col / colSize ) * colSize, useTab ? '\t' : ' ' );
    }

    public async writeIndexFile(
        file: TFile,
        instanceIndex: TaskInstanceIndex,
        taskIndex: TaskIndex
    ): Promise<string> {
        instanceIndex = filterIndexByPath( file.path, instanceIndex );
        const lines = new Array(values(instanceIndex).length).fill('');
        for (const inst of values(instanceIndex)) {
            lines[inst.position.start.line] = this.renderTaskInstance(inst, taskIndex, instanceIndex, true);
        }
        await this.vault.modify( file, lines.join( '\n' ) );
        return hashFileTaskState( instanceIndex );
    }

    public async writeStateToFile( file: TFile, { instanceIndex, taskIndex }: TaskStoreState ) {
        const fileIndex = filterIndexByPath( file.path, instanceIndex );
        const contents = (await this.vault.read( file ));
        const contentLines = contents.split( '\n' );

        for ( const locStr in fileIndex ) {
            const lineTask = fileIndex[ locStr ];
            const lineNumber = lineTask.position.start.line;
            contentLines[ lineNumber ] = this.renderTaskInstance( lineTask, taskIndex, fileIndex );
        }
        await this.vault.modify( file, contentLines.filter( cl => cl !== null ).join( '\n' ) )
        return hashFileTaskState( fileIndex )
    }

    public getTaskPath( task: Task ): string {
        return `${this.tasksDirectory.path}/${taskToFilename( task )}`;
    }

    public async deleteFile( file: TAbstractFile ) {
        if ( !file )
            return;
        if ( file instanceof TFile ) {
            if ( this.isTaskFile( file ) )
                await this.vault.delete( file )
        }
        delete this.fileStates[ file.path ];
    }

    setFileStateHash( path: string, fileState: FileState ) {
        this.fileStates[ path ] = { ...fileState }
    }

    testAndSetFileStatus( path: string, status: CacheStatus ) {
        const current = this.fileStates[ path ] || { status: CacheStatus.UNKNOWN, hash: '' }
        this.fileStates[ path ] = { ...current, status };
        return current.status === status;
    }
}