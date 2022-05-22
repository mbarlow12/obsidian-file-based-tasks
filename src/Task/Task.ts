import { keys, pick, values } from 'lodash';
import { stringifyYaml, TFile } from "obsidian";
import { rrulestr } from "rrule";
import { TaskInstanceIndex } from '../Store/types';
import { hash } from "../util/hash";
import { emptyPosition, posFromStr, posStr, TaskInstanceYamlObject, TaskLocation } from "./index";
import { NonEmptyString, Task, TaskInstance, TaskRecordType, TaskYamlObject } from "./types";


const taskFileNameRegex = /^(?<name>\w.*)(?= - \d+) - (?<id>\d+)(?:.md)?/;

export const emptyTaskInstance = (): TaskInstance => {
    return {
        id: '',
        complete: false,
        name: '',
        parent: -1,
        position: emptyPosition( 0 ),
        rawText: '',
        filePath: ''
    };
};

export const emptyTask = (): Task => {
    const { id, complete, name } = emptyTaskInstance();
    return {
        id,
        uid: 0,
        name,
        complete,
        childUids: [],
        created: new Date( 0 ),
        parentUids: [],
        updated: new Date( 0 ),
        instances: [],
        description: ''
    }
}

export const createTaskFromInstance = ( inst: TaskInstance ): Task => {
    return {
        ...emptyTask(),
        ...pick( inst, 'name', 'id', 'complete', 'dueDate', 'recurrence', 'tags' ),
        ...({ uid: taskIdToUid(inst.id) || 0 }),
        instances: [ inst ],
    };
}

export const instancesLocationsEqual = (
    instA: TaskInstance,
    instB: TaskInstance
): boolean => (
    instA.filePath === instB.filePath &&
    instA.position.start.line === instB.position.start.line
);


export const flattenInstanceIndex = (
    idx: Record<string, Record<number, TaskInstance>>
): TaskInstance[] => keys( idx )
    .reduce( ( flattened, path ) => [
        ...flattened,
        ...values( idx[ path ] )
    ], [] as TaskInstance[] )
    .filter( ( inst, i, arr ) => arr.findIndex(check => instancesLocationsEqual(inst, check)) === i )

export const getTasksFromInstanceIndex = ( instIdx: TaskInstanceIndex ): Record<string, Task> => {
    const instances = flattenInstanceIndex( instIdx );
    values( instances.reduce( ( iRec, inst ) => ({
        ...iRec,
        [ inst.name ]: {
            ids: [ ...(iRec[ inst.name ] || { ids: [] }).ids, inst.id ]
                .filter( ( s, i, arr ) => arr.indexOf( s ) === i ),
            uids: [ ...(iRec[ inst.name ] || { uids: [] }).uids, inst.uid ]
                .filter( ( id, i, arr ) => arr.indexOf( id ) === i )
        }
    }), {} as Record<string, { ids: string[], uids: number[] }> ) )
        .forEach( ( { ids, uids } ) => {
            if ( ids.length !== 1 || uids.length !== 1 )
                throw new Error( 'Tasks with same name must all have the same id and uid (possibly zero).' )
        } );

    return instances.reduce( ( nameTaskMap, instance ) => {
        return {
            ...nameTaskMap,
            [ instance.name ]: {
                ...createTaskFromInstance( instance ),
                instances: [ ...(nameTaskMap[ instance.name ]?.instances || []), instance ],
                parentUids: [
                    ...(nameTaskMap[ instance.name ]?.parentUids || []),
                    getTaskInstanceParent( instance, instIdx )?.uid
                ].filter( x => x )
            }
        }
    }, {} as Record<string, Task> );
}

export const getTaskInstanceParent = (
    instance: TaskInstance,
    idx: TaskInstanceIndex
): TaskInstance | null => instance.parent >= 0 ? idx[ instance.filePath ][ instance.parent ] : null;

export const taskUidToId = ( uid: number ) => uid.toString( 16 );

export const taskIdToUid = ( id: string ) => isNaN( Number.parseInt( id, 16 ) ) ? 0 : Number.parseInt( id, 16 );

export const baseTasksSame = ( tA: TaskInstance, tB: TaskInstance ): boolean => {
    return tA.id === tB.id && tA.name == tB.name && tA.complete === tB.complete;
}

export const getTaskFromYaml = ( yaml: TaskYamlObject ): Task => {
    const {
        complete,
        id,
        name,
        created,
        updated,
        childUids,
        parentUids,
        instances,
        uid,
        recurrence,
        tags,
        dueDate
    } = yaml;
    return {
        uid: Number.parseInt( uid ),
        id: id as NonEmptyString,
        name,
        complete: complete === 'true',
        created: new Date( created ),
        updated: new Date( updated ),
        instances: instances.map( taskInstanceFromYaml( yaml ) ),
        childUids: childUids.map( Number.parseInt ),
        parentUids: parentUids.map( Number.parseInt ),
        recurrence: rrulestr( recurrence ),
        tags,
        dueDate: new Date( dueDate ),
        description: ''
    };
}

export const taskToYamlObject = ( task: Task ): TaskYamlObject => {
    const {
        id,
        uid,
        name,
        complete,
        instances,
        created,
        updated,
        childUids,
        parentUids,
        tags,
        dueDate,
        recurrence
    } = task
    return {
        type: TaskRecordType,
        id: id,
        uid: `${uid}`,
        name,
        complete: `${complete}`,
        created: created.toISOString(),
        updated: updated.toISOString(),
        childUids: childUids.map( c => `${c}` ),
        parentUids: parentUids.map( c => `${c}` ),
        tags,
        dueDate: dueDate.toISOString(),
        recurrence: (recurrence || '').toString(),
        instances: instances.map( taskInstanceToYamlObject )
    };
}

export const taskInstanceToYamlObject = ( inst: TaskInstance ): TaskInstanceYamlObject => {
    const {
        complete,
        rawText,
        filePath,
        position,
        parent
    } = inst;
    return {
        rawText,
        filePath,
        position: posStr( position ),
        parent: `${parent}`,
        complete: complete ? 'true' : 'false',
    }
}

export const taskInstanceFromYaml = ( tYaml: TaskYamlObject ) => ( yaml: TaskInstanceYamlObject ): TaskInstance => {
    const { id, name, complete, dueDate, recurrence, tags } = tYaml
    const { rawText, filePath, position, parent } = yaml;
    return {
        id,
        name,
        tags,
        rawText,
        filePath,
        uid: taskIdToUid( id ),
        complete: complete === 'true',
        dueDate: new Date( dueDate ),
        recurrence: rrulestr( recurrence ),
        position: posFromStr( position ),
        parent: Number.parseInt( parent )
    }
}

export const taskToBasename = ( task: Task ) => `${task.name} - ${task.id}`;
export const taskToFilename = ( task: Task ) => `${taskToBasename( task )}.md`;

export const isFilenameValid = ( f: TFile ): boolean => {
    const match = f.basename.match( taskFileNameRegex );
    if ( !match )
        return false

    if ( !match.groups.hasOwnProperty( 'name' ) )
        return false;

    return match.groups.hasOwnProperty( 'id' );


}

export const parseTaskFilename = ( f: TFile ) => {
    const match = f.basename.match( taskFileNameRegex );
    const { name, id } = match.groups;
    return { name, id };
};

export const taskToTaskFileContents = ( task: Task ): string => {
    const yamlObject = taskToYamlObject( task );
    return `---\n${stringifyYaml( yamlObject )}---\n${task.description || ''}`;
}

export const taskToJsonString = ( task: Task ): string => {
    const {
        name, complete, instances, description, created
    } = task;
    const ret: Record<string, string | boolean | Array<TaskLocation> | string[]> = {
        name, complete, created: `${created}`
    };
    ret.locations = instances
        .map( ( { filePath, position, parent } ) => ({ filePath, position, parent }) )
        .sort( ( a, b ) => {
            const comp = a.filePath.localeCompare( b.filePath );
            if ( comp === 0 ) {
                return a.position.start.line - b.position.start.line;
            }
            return comp;
        } );
    if ( description )
        ret.description = description.trim();
    return JSON.stringify( ret );
}

export const hashTask = async ( task: Task ): Promise<string> => {
    return await hash( taskToJsonString( task ) );
}

export const taskAsChecklist = ( t: Pick<TaskInstance, 'id' | 'name' | 'complete'> ) => `- [${t.complete
                                                                                              ? 'x'
                                                                                              : ' '}] ${t.name} ^${t.id}`;

export const taskFileLine = ( t: TaskInstance, offset = 0 ) => new Array( offset ).fill( ' ' )
    .join( '' ) + taskAsChecklist( t );

/**
 * if both rets are empty, children are identical
 * if ret[0] is empty, taskB has added child task ids
 * if ret[1] is empty, taskB has deleted child task ids
 * if neither are empty, taskA's ids were deleted and taskB's were added
 *
 * @param taskA
 * @param taskB
 * @return Array - [child ids in A not in B, child ids in B not in A]
 */
export const compareTaskChildren = ( taskA: Task, taskB: Task ): [ number[], number[] ] => {
    return compareArrays( taskA.childUids, taskB.childUids );
};

export const compareArrays = <T>( first: T[], second: T[] ): [ T[], T[] ] => {
    const firstItems = new Set<T>( first );
    const secondItems = new Set<T>();
    for ( const si of second ) {
        if ( !firstItems.has( si ) ) {
            secondItems.add( si );
        }
        else {
            firstItems.delete( si );
        }
    }
    return [ Array.from( firstItems ), Array.from( secondItems ) ];
};