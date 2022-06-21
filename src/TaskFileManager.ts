import { values } from 'lodash';
import { EventRef, FrontMatterCache, MetadataCache, TAbstractFile, TFile, TFolder, Vault } from "obsidian";
import { TaskEvents } from "./Events/TaskEvents";
import { getFileInstanceIndex } from "./File";
import { hashTaskInstance, lineTaskToChecklist, taskInstancesFromTask } from "./Store/TaskStore";
import { TaskInstanceIndex, TaskStoreState } from './Store/types';
import {
    getTaskFromYaml,
    hashTask,
    parseTaskFilename,
    PrimaryTaskInstance,
    Task,
    taskLocationStrFromInstance,
    taskLocFromMinStr,
    TaskRecordType,
    taskToFilename,
    taskToTaskFileContents,
    TaskYamlObject
} from "./Task";
import { isPrimaryInstance } from './Task/Task';

export const hashFileTaskState = ( state: TaskInstanceIndex ): string =>
    Object.keys( state )
        .map( locStr => state[ locStr ] )
        .sort( ( tA, tB ) => tA.position.start.line - tB.position.start.line )
        .map( hashTaskInstance )
        .join( '\n' );

export const filterIndexByPath = ( filePath: string, index: TaskInstanceIndex ): TaskInstanceIndex =>
    Object.keys( index )
        .filter( s => taskLocFromMinStr( s ).filePath === filePath )
        .reduce( ( fst, locStr ) => ({ ...fst, [ locStr ]: index[ locStr ] }), {} )

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
    private backlogName = 'Backlog.md';
    private backlog: TFile;
    private _tasksDirectory: TFolder;
    private vault: Vault;
    private mdCache: MetadataCache;
    private events: TaskEvents;
    private taskStoreEventRef: EventRef;
    private fileStates: Record<string, FileState>;

    constructor(
        vault: Vault,
        cache: MetadataCache,
        events: TaskEvents,
        tasksDirectory = 'tasks',
        backlogFile = 'BACKLOG.md'
    ) {
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
        this.backlogName = backlogFile;
        this.fileStates = {};
    }

    public async handleIndexUpdate( { taskIndex, instanceIndex }: TaskStoreState ) {
        const deleteMarks = new Set( Object.keys( this.fileStates ) )
        // update task files
        for ( const taskId in taskIndex ) {
            const idxTask = taskIndex[ taskId ];
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

        const filePaths = Object.keys( instanceIndex )
            .filter( fp => !isPrimaryInstance( instanceIndex[ fp ] ) )
            .map( s => taskLocFromMinStr( s ).filePath )
            .filter( ( fp, i, fps ) => fps.indexOf( fp ) === i )
            .filter( fp => !fp.includes( this.backlogName ) );

        // update note files
        for ( const path of filePaths ) {
            const newState = filterIndexByPath( path, instanceIndex );
            const newHash = hashFileTaskState( newState );
            deleteMarks.delete( path )
            if ( path in this.fileStates && this.fileStates[ path ].hash === newHash )
                continue

            const file = this.vault.getAbstractFileByPath( path ) as TFile;
            const hash = await this.writeStateToFile( file, newState )

            if ( hash !== newHash )
                throw Error( `Something went wrong when hashing the state for ${file.path}` )

            this.fileStates[ file.path ] = {
                hash,
                status: CacheStatus.CLEAN,
            }
        }
        // update backlog
        const primaryTasks: PrimaryTaskInstance[] = values(instanceIndex).reduce((acc, i) => {
            if (isPrimaryInstance(i))
                acc = acc.concat(i);
            return acc;
        }, [] as PrimaryTaskInstance[]);
        const primeIdx = primaryTasks.sort((a, b) => a.created.getTime() - b.created.getTime())
            .reduce((idx, i) => ({
                ...idx,
                [i.filePath]: i
            }), {} as TaskInstanceIndex);
        let backlog = this.vault.getAbstractFileByPath( this.backlogName ) as TFile;
        if (!backlog)
            backlog = await this.vault.create( this.backlogName, '');
        const backlogHash = await this.writeStateToFile(backlog, primeIdx);
        [ ...deleteMarks ].map( path => this.vault.getAbstractFileByPath( path ) )
            .map( async d => await this.deleteFile( d ) );
    }

    public async getFileTaskState( file: TFile ) {
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
        return getFileInstanceIndex( file, cache, contents );
    }

    public async writeStateToFile( file: TFile, state: TaskInstanceIndex ) {
        if ( Object.keys( state ).filter( s => taskLocFromMinStr( s ).filePath !== file.path ).length > 0 )
            throw new Error( `State with invalid paths passed to ${file.path}.` )

        const contents = (await this.vault.read( file ));
        const contentLines = contents.split('\n');
        const existingIndex = getFileInstanceIndex(file, this.mdCache.getFileCache(file), contents);
        const config = (this.vault as Vault & { config: Record<string, boolean | number> }).config;

        let useTab = true;
        let tabSize = 4;
        if ( config.hasOwnProperty( 'useTab' ) && typeof config.useTab === "boolean" )
            useTab = config.useTab;
        if ( config.hasOwnProperty( 'tabSize' ) && typeof config.tabSize === 'number' )
            tabSize = config.tabSize;

        for ( const locStr in existingIndex ) {
            if (!(locStr in state)) {
                const delLine = existingIndex[locStr].position.start.line;
                contentLines[delLine] = null;
            }
        }
        for ( const locStr in state ) {
            const lineTask = state[ locStr ];
            const lineNumber = lineTask.position.start.line;
            const checklistItem = lineTaskToChecklist( lineTask );
            const colCount = lineTask.position.start.col * (useTab ? 1 : tabSize);
            const char = useTab ? '\t' : ' ';
            contentLines[ lineNumber ] = ''.padStart( colCount, char ) + checklistItem;
        }
        await this.vault.modify( file, contentLines.filter(cl => cl !== null).join( '\n' ) )
        return hashFileTaskState( state )
    }

    public getTaskPath( task: Task ): string {
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
        const linesToDelete = values( getFileInstanceIndex( deleted, this.mdCache.getFileCache( deleted ), contents ) )
            .map( inst => inst.position.start.line );
        const newContents = contents.split( '\n' );
        for ( const lineToDelete of linesToDelete ) {
            newContents[ lineToDelete ] = null;
        }
        await this.vault.modify( deleted, newContents.filter( l => l !== null ).join( '\n' ) )
    }
}