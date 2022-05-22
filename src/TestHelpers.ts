import { entries } from 'lodash';
import { Pos } from 'obsidian';
import { RRule } from 'rrule';
import { pos, Task, TaskInstance } from './Task';
import { taskUidToId } from './Task/Task';
import data from './TestData'

const bullets = [ '-', '*' ];

const invalidTaskLines = [
    '-[    invalid task 1',
    '-   x] invalid task 2',
    '- [x]            ',
    '[]',
]

export function todoTemplate( strings: TemplateStringsArray, ...keys: number[] ) {
    return ( ...values: string[] ): string => {
        values[ 0 ] = values[ 0 ] === 'x' ? 'x' : ' ';
        const result = [ strings[ 0 ] ];
        for ( const [ i, key ] of keys.entries() ) {
            const value = values[ key ];
            result.push( value, strings[ i + 1 ] )
        }
        return result.join( '' );
    }
}

const validHTask = todoTemplate`- [${0}] ${1}`;
const validATask = todoTemplate`* [${0}] ${1}`;

export const randInt = ( min = 0, max = 15 ): number => {
    return Math.round( Math.random() * Math.abs( max - min ) + Math.min( min, max ) )
}

export const createValidTaskLine = ( name: string, isComplete: boolean ): string => {
    const b = bullets[ Math.round( Math.random() ) ];
    const spaces: string[] = Array( randInt() ).fill( ' ' );
    if ( isComplete ) {
        const xi = randInt( 0, spaces.length );
        spaces.splice( xi, 0, 'x' );
    }
    return `${b} [${spaces.join( '' )}] a valid task`;
}

export const createStrictValidTaskLine = ( name: string, isComplete: boolean ): string => {
    const b = isComplete ? 'x' : '';
    if ( randInt( 0, 1 ) )
        return validATask( b, name );
    return validHTask( b, name );
}

export const createInvalidTaskLine = ( name?: string ): string => {
    const i = randInt( 0, invalidTaskLines.length );
    return invalidTaskLines[ i ];
}

export const createTaskFileContents = ( validCount = 10, invalidCount?: number ) => {
    invalidCount ||= 0;
    const miscLines = data.fileContents;
    const validLines = Array( validCount ).fill( '' )
        .map( ( _, i ) => createStrictValidTaskLine( `valid task ${i}`, i % 2 === 0 ) )
    const invalidLines = Array( invalidCount ).fill( '' ).map( _ => createInvalidTaskLine() )
    return shuffle<string>( miscLines.concat( validLines, invalidLines ) ).join( '\n' )
}

function shuffle<T>( a: Array<T> ): Array<T> {
    let j, x, i;
    for ( i = a.length - 1; i > 0; i-- ) {
        j = Math.floor( Math.random() * (i + 1) );
        x = a[ i ];
        a[ i ] = a[ j ];
        a[ j ] = x;
    }
    return a;
}

export const baseDate = new Date( "5/18/2022, 2:00:00 PM" );
export const testInts = [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 ];
export const taskNames = testInts.map( i => `task number ${i}` );
export const taskUids = testInts.map( i => i + 100000 );
export const taskIds = taskUids.map( i => taskUidToId( i ) );
export const filePaths = testInts.map( i => `path/to/file ${i}.md` )
export const createTestTask = (
    uid: number,
    complete = false,
    parentUids: number[] = [],
    childUids: number[] = [],
    updated = new Date( baseDate.getTime() ),
    created = new Date( baseDate.getTime() - (24 * 60 * 60 * 1000) ),
    instances: TaskInstance[] = [],
    dueDate?: Date,
    recurrence?: RRule,
    tags?: string[],
): Task => ({
    id: (uid).toString( 16 ),
    uid: uid,
    name: `task with uid ${uid}`,
    complete,
    parentUids,
    childUids,
    instances,
    updated,
    created,
    description: '',
});
export const testUidValue = ( uid: number ) => uid + 100000;
export const createTestTaskInstance = (
    uid: number,
    position: Pos,
    parent = -1,
    filePath?: string,
    complete = false,
    indent = 0,
    dueDate?: Date,
    recurrence?: RRule,
    tags?: string[],
): TaskInstance => ({
    id: uid > 0 ? uid.toString( 16 ) : '',
    name: `task with uid ${uid}`,
    complete,
    filePath: filePath || `path/to/file with uid ${uid}.md`,
    parent,
    position,
    rawText: `${new Array( indent * 2 )
        .fill( ' ' ).join( '' )}- [${complete ? 'x' : ' '}] task with uid ${uid}`,
});
export const createPositionAtLine = ( line: number ) => pos( line, 0, 0, line, 0, 0 );
export const createTestTaskInstances = (
    data: Record<string, { line: number, uid: number, parent?: number }[]>
): TaskInstance[] => entries( data ).reduce( ( tis, [ fp, lines ] ) => {
    const instances = lines.map( ( { line, uid, parent } ) => {
        return createTestTaskInstance( uid, createPositionAtLine( line ), parent || -1, fp )
    } );
    return [
        ...tis,
        ...instances
    ]
}, [] as TaskInstance[] );

const test: TaskInstance[] = createTestTaskInstances(
    {
        'path/to/file 1': [
            { line: 0, uid: 1 },
            { line: 1, uid: 0 }
        ],
        'path/to/file 2': [
            { line: 5, uid: 8 },
            { line: 6, uid: 10, parent: 5 }
        ]
    },
)