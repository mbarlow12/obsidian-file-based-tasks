import { EventRef, FrontMatterCache, MetadataCache, TAbstractFile, TFile, TFolder, Vault } from "obsidian";
import { TaskEvents } from "./Events/TaskEvents";
import { TaskModifiedData } from "./Events/types";
import { getFileTaskState } from "./File";
import { hashLineTask, indexedTaskToState, lineTaskToChecklist } from "./Store/TaskStore";
import { State, TaskIndex } from './Store/types';
import {
    getTaskFromYaml,
    hashTask,
    IndexedTask,
    parseTaskFilename,
    taskLocFromMinStr,
    taskLocFromStr,
    TaskRecordType,
    taskToFileContents,
    taskToFilename,
    TaskYamlObject
} from "./Task";

export const hashFileTaskState = ( state: State ): string =>
    Object.keys( state )
        .map( locStr => state[ locStr ] )
        .sort( ( tA, tB ) => tA.position.start.line - tB.position.start.line )
        .map( hashLineTask )
        .join( '\n' );

export const filterStateByPath = ( filePath: string, state: State ): State =>
    Object.keys( state )
        .filter( s => taskLocFromStr( s ).filePath === filePath )
        .reduce( ( fst, locStr ) => ({ ...fst, [ locStr ]: state[ locStr ] }), {} )

export enum CacheStatus {
    CLEAN = 'CLEAN',
    DIRTY = 'DIRTY',
}

export interface FileState {
    status: CacheStatus;
    hash: string;
}

export class TaskFileManager {
    private tasksDirString: string;
    private _tasksDirectory: TFolder;
    private vault: Vault;
    private mdCache: MetadataCache;
    private events: TaskEvents;
    private taskStoreEventRef: EventRef;
    private fileStates: Record<string, FileState>;

    constructor( vault: Vault, cache: MetadataCache, events: TaskEvents, tasksDirectory = 'tasks' ) {
        this.vault = vault;
        this.mdCache = cache;
        this.events = events;
        this.taskStoreEventRef = this.events.registerIndexUpdatedHandler( this.handleIndexUpdate.bind( this ) )
        this.tasksDirString = tasksDirectory;
        this._tasksDirectory = this.vault.getAbstractFileByPath( tasksDirectory ) as TFolder;
        if ( !this._tasksDirectory ) {
            this.vault.createFolder( tasksDirectory )
                .then( () => {
                    this._tasksDirectory = this.vault.getAbstractFileByPath( tasksDirectory ) as TFolder;
                } );
        }
        this.fileStates = {};
    }

    public async handleIndexUpdate( { index, taskState }: TaskModifiedData ) {
        const deleteMarks = new Set( Object.keys( this.fileStates ) )
        for ( const taskId in index ) {
            const idxTask = index[ taskId ];
            const newTaskHash = await hashTask( idxTask );
            const taskFilePath = this.getTaskPath( idxTask )
            deleteMarks.delete( taskFilePath )
            if (
                taskFilePath in this.fileStates &&
                this.fileStates[ taskFilePath ].status === CacheStatus.CLEAN &&
                this.fileStates[ taskFilePath ].hash === newTaskHash
            ) continue;
            await this.storeTaskFile( idxTask )
            this.fileStates[ taskFilePath ] = {
                status: CacheStatus.CLEAN,
                hash: newTaskHash
            };
        }

        const filePaths = Object.keys( taskState )
            .map( s => taskLocFromMinStr( s ).filePath )
            .filter( ( fp, i, fps ) => fps.indexOf( fp ) === i );

        for ( const path in filePaths ) {
            const newState = filterStateByPath( path, taskState );
            const newHash = hashFileTaskState( newState );
            deleteMarks.delete( path )
            if ( path in this.fileStates && this.fileStates[ path ].hash === newHash )
                continue

            const file = this.vault.getAbstractFileByPath( path ) as TFile;
            const hash = await this.writeStateToFile( file, index, newState )

            if ( hash !== newHash )
                throw Error( `Something went wrong when hashing the state for ${file.path}` )

            this.fileStates[ file.path ] = {
                hash,
                status: CacheStatus.CLEAN,
            }
        }
        [ ...deleteMarks ].map( this.vault.getAbstractFileByPath ).map( async d => await this.deleteFile( d ) );
    }

    public async getFileTaskState( file: TFile ) {
        let state: State;
        if ( this.isTaskFile( file ) ) {
            const idxTask = await this.readTaskFile( file );
            state = indexedTaskToState( idxTask );
        }
        else {
            state = await this.readMarkdownFile( file )
        }
        const newHash = hashFileTaskState( state );
        const fileState = this.getFileStateHash( file.path );
        if ( newHash !== fileState.hash ) {
            this.setFileStateHash( file.path, { hash: newHash, status: CacheStatus.DIRTY } )
            return state;
        }
        return null;
    }

    public get tasksDirectory() {
        return this._tasksDirectory;
    }

    public set tasksDirectory( dir: TFolder ) {
        this._tasksDirectory = dir;
    }

    public getFileStateHash( path: string ): FileState {
        return (path in this.fileStates && this.fileStates[ path ]) || null
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

    public async storeTaskFile( task: IndexedTask ) {
        const fullPath = this.getTaskPath( task );
        const file = this.vault.getAbstractFileByPath( fullPath );
        if ( !file ) {
            return this.vault.create( fullPath, taskToFileContents( task ) );
        }
        else {
            return this.vault.modify( file as TFile, taskToFileContents( task ) )
        }
    }

    public getAppConfig() {
        return (this.vault as any).config;
    }

    public isTaskFile( file: TFile ): boolean {
        const pathParts = file.path.split( '/' );
        if ( pathParts.length < 2 )
            return false;
        const parent = pathParts[ pathParts.length - 2 ];
        if ( parent !== this.tasksDirString )
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
                  type, id, name, locations, complete, created, updated, parents, children, recurrence
              } = cfm;
        return {
            type, id, name, locations, complete, created, updated, parents, children, recurrence
        } as unknown as TaskYamlObject
    }

    public async readTaskFile( file: TFile ): Promise<IndexedTask> {
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

    public async readMarkdownFile( file: TFile ): Promise<State> {
        const cache = this.mdCache.getFileCache( file );
        const contents = await this.vault.read( file );
        return getFileTaskState( file, cache, contents );
    }

    public async writeStateToFile( file: TFile, index: TaskIndex, state: State ) {
        if ( Object.keys( state ).filter( s => taskLocFromMinStr( s ).filePath !== file.path ).length > 0 )
            throw new Error( `State with invalid paths passed to ${file.path}.` )

        const contents = (await this.vault.read( file )).split( '\n' );
        const config = (this.vault as Vault & { config: Record<string, boolean | number> }).config;

        let useTab = true;
        let tabSize = 4;
        if ( config.hasOwnProperty( 'useTab' ) && typeof config.useTab === "boolean" )
            useTab = config.useTab;
        if ( config.hasOwnProperty( 'tabSize' ) && typeof config.tabSize === 'number' )
            tabSize = config.tabSize;

        for ( const locStr in state ) {
            const lineTask = state[ locStr ];
            const lineNumber = lineTask.position.start.line;
            const checklistItem = lineTaskToChecklist( lineTask );
            const colCount = lineTask.position.start.col * (useTab ? 1 : tabSize);
            const char = useTab ? '\t' : ' ';
            contents[ lineNumber ] = ''.padStart( colCount, char ) + checklistItem;
        }
        await this.vault.modify( file, contents.join( '\n' ) )
        return hashFileTaskState( state )
    }

    public getTaskPath( task: IndexedTask ): string {
        return `${this.tasksDirectory.path}/${taskToFilename( task )}`;
    }

    public async deleteFile( file: TAbstractFile ) {
        if ( file instanceof TFile ) {
            if ( this.isTaskFile( file ) )
                await this.vault.delete( file )
            else
                await this.deleteTasksFromFile( file )
            delete this.fileStates[ file.path ];
        }
    }

    setFileStateHash( path: string, fileState: FileState ) {
        this.fileStates[ path ] = { ...fileState }
    }

    testAndSetFileStatus( path: string, status: CacheStatus ) {
        const current = this.fileStates[ path ] || { status: CacheStatus.DIRTY, hash: '' }
        this.fileStates[ path ] = { ...current, status };
        return current.status === status;
    }

    private async deleteTasksFromFile( deleted: TFile ) {
        const contents = (await this.vault.read( deleted ));
        const state = getFileTaskState( deleted, this.mdCache.getFileCache( deleted ), contents )

    }
}