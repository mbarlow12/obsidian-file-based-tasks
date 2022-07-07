import { pick } from 'lodash';
import { stringifyYaml, TFile } from "obsidian";
import { rrulestr } from "rrule";
import { TASK_BASENAME_REGEX, TaskParser } from '../Parser/TaskParser';
import { taskInstanceToChecklist } from '../Store/TaskStore';
import { hash } from "../util/hash";
import {
    emptyPosition,
    parsePosStr,
    posStr,
    PrimaryTaskInstance,
    Task,
    TaskInstanceYamlObject,
    taskLocation,
    TaskLocation,
    taskLocationStr,
    taskLocFromStr
} from "./index";
import { NonEmptyString, TaskInstance, TaskRecordType, TaskYamlObject } from "./types";


export const emptyTaskInstance = (): TaskInstance => {
    return {
        id: '',
        complete: false,
        name: '',
        parent: -1,
        position: emptyPosition( 0 ),
        rawText: '',
        filePath: '',
        primary: false,
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
        locations: [],
        description: ''
    }
}

export const isPrimaryInstance = ( inst: TaskInstance | PrimaryTaskInstance ): inst is PrimaryTaskInstance => {
    return inst.primary
}

export const isTaskInstance = ( obj: unknown ): obj is TaskInstance => {
    for ( const prop of [ 'name', 'parent', 'uid', 'id', 'complete', 'rawText', 'filePath' ] ) {
        if ( !obj.hasOwnProperty( prop ) )
            return false;
    }
    return true;
};

export const taskInstanceFromTask = (
    filePath: string,
    line: number,
    task: Task
): TaskInstance => {
    const { name, complete, id, uid, tags, dueDate, recurrence, completedDate } = task;
    const inst: TaskInstance = {
        uid,
        id,
        name,
        complete,
        tags,
        dueDate,
        recurrence,
        parent: -1,
        filePath,
        position: emptyPosition( line ),
        completedDate,
        rawText: '',
        primary: false
    };
    inst.rawText = taskInstanceToChecklist( inst );
    return inst;
};

export const isTask = ( t: TaskInstance | Task ): t is Task => (
    'created' in t &&
    'updated' in t &&
    'instances' in t &&
    'parentUids' in t &&
    'childUids' in t
);

export const createTaskFromPrimary = ( primary: PrimaryTaskInstance ): Task => {
    const {
        name, uid, completedDate, updated, created, complete, dueDate, recurrence, tags
    } = primary;
    return {
        name,
        uid,
        id: taskUidToId( uid ),
        complete,
        updated,
        created,
        locations: [ taskLocation( primary ) ],
        completedDate,
        dueDate,
        recurrence,
        tags,
        childUids: [],
        parentUids: [],
        description: ''
    }
};

export const createTaskFromInstance = ( inst: TaskInstance ): Task => {
    return {
        ...emptyTask(),
        ...pick( inst, 'name', 'id', 'complete', 'dueDate', 'recurrence', 'tags' ),
        ...({ uid: inst.uid || taskIdToUid( inst.id ) || 0 }),
        ...(isPrimaryInstance( inst ) && pick( inst, 'created', 'updated' )),
        locations: [ taskLocation( inst ) ]
    };
}

export const taskInstancesEqual = (
    a: TaskInstance,
    b: TaskInstance
) => {
    return a.name === b.name &&
        a.filePath === b.filePath &&
        a.position.start.line === b.position.start.line &&
        ([ a.uid, b.uid ].includes( 0 ) || (a.uid === b.uid)) &&
        (a.tags || []).sort().join( ' ' ) === (b.tags || []).sort().join( ' ' ) &&
        (a.recurrence === b.recurrence || a.recurrence.toString() === b.recurrence.toString()) &&
        a.dueDate === b.dueDate &&
        a.completedDate === b.completedDate;
}

export const instanceLocationsEqual = (
    instA: TaskInstance,
    instB: TaskInstance
): boolean => (
    instA.filePath === instB.filePath &&
    instA.position.start.line === instB.position.start.line
);


export const taskUidToId = ( uid: number ) => uid.toString( 16 );

export const taskIdToUid = ( id: string ) => isNaN( Number.parseInt( id, 16 ) ) ? 0 : Number.parseInt( id, 16 );

export const baseTasksSame = ( tA: TaskInstance, tB: TaskInstance ): boolean => {
    return tA.uid === tB.uid && tA.name == tB.name && tA.complete === tB.complete;
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
        locations,
        uid,
        recurrence,
        tags,
        dueDate,
        completedDate,
    } = yaml;
    return {
        uid: Number.parseInt( uid ),
        id: id as NonEmptyString,
        name,
        complete: complete === 'true',
        created: new Date( created ),
        updated: new Date( updated ),
        locations: (locations || []).map( taskLocFromStr ),
        childUids: childUids.map( Number.parseInt ),
        parentUids: parentUids.map( Number.parseInt ),
        ...(tags && tags.length && { tags }),
        ...(dueDate && dueDate.length && { dueDate: new Date( dueDate ) }),
        ...(recurrence && recurrence.length && { recurrence: rrulestr( recurrence ) }),
        ...(completedDate && completedDate.length && { completedDate: new Date( completedDate ) }),
        description: ''
    };
}

export const taskToYamlObject = ( task: Task ): TaskYamlObject => {
    const {
        id,
        uid,
        name,
        complete,
        locations,
        created,
        updated,
        childUids,
        parentUids,
        tags,
        dueDate,
        recurrence
    } = task;
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
        ...(tags && { tags }),
        ...(dueDate && { dueDate: dueDate.toISOString() }),
        ...(recurrence && { recurrence: recurrence.toString() }),
        locations: locations.map( taskLocationStr )
    };
}

export const taskInstanceToYamlObject = ( inst: TaskInstance ): TaskInstanceYamlObject => {
    const {
        complete,
        rawText,
        filePath,
        position,
        parent,
        primary
    } = inst;
    if ( isNaN( position.start.col ) )
        throw new Error( `instance: ${inst.name} in ${inst.filePath} at ${position.start.line} has NaN column` );
    return {
        rawText,
        filePath,
        position: posStr( position ),
        parent: `${parent}`,
        complete: complete.toString(),
        primary: primary.toString()
    }
}

export const taskInstanceFromYaml = ( tYaml: TaskYamlObject ) => ( yaml: TaskInstanceYamlObject ): TaskInstance => {
    const { id, name, complete, dueDate, recurrence, tags, completedDate } = tYaml
    const { rawText, filePath, position, parent, primary, links } = yaml;
    return {
        id,
        name,
        rawText,
        filePath,
        uid: taskIdToUid( id ),
        complete: complete === 'true',
        position: parsePosStr( position ),
        parent: Number.parseInt( parent ),
        primary: primary === 'true',
        ...(tags && tags.length && { tags }),
        ...(dueDate && dueDate.length && { dueDate: new Date( dueDate ) }),
        ...(recurrence && recurrence.length && { recurrence: rrulestr( recurrence ) }),
        ...(completedDate && completedDate.length && { completedDate: new Date( completedDate ) }),
        ...(links && links.length && { links })
    } as TaskInstance;
}

export const taskToBasename = ( task: TaskInstance | Task ) => `${TaskParser.normalizeName( task.name )} (${task.id})`;
export const taskToFilename = ( task: TaskInstance | Task ) => `${taskToBasename( task )}.md`;

export const isFilenameValid = ( f: TFile ): boolean => {
    const match = f.basename.match( TASK_BASENAME_REGEX );
    if ( !match )
        return false

    if ( !match.groups.hasOwnProperty( 'name' ) )
        return false;

    return match.groups.hasOwnProperty( 'id' );


}

export const parseTaskFilename = ( f: TFile ) => {
    const match = f.basename.match( /\(([\w\d]+)\)$/ );
    if (!match)
        return null;
    return { id: match[ 1 ] }
};

export const renderTaskInstanceLinks = ( task: Task ) => {
    return task.locations.map( loc => `[[${loc.filePath}#^${task.id}]]` ).join( ' ' );
};

export const taskToTaskFileContents = ( task: Task ): string => {
    const yamlObject = taskToYamlObject( task );
    const data = `---\n${stringifyYaml( yamlObject )}---\n${task.description || ''}`;
    return `${data}\n\n\n---\n${renderTaskInstanceLinks( task )}`;
}

export const taskToJsonString = ( task: Task ): string => {
    const {
        name, complete, locations, description, created
    } = task;
    const ret: Record<string, string | boolean | Array<TaskLocation> | string[]> = {
        name, complete, created: `${created}`
    };
    ret.locations = locations.sort( ( a, b ) => {
        const comp = a.filePath.localeCompare( b.filePath );
        if ( comp === 0 ) {
            return a.line - b.line;
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