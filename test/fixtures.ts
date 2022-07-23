import { CreateProps, ORM } from 'redux-orm';
import { Tag, Task, TaskInstance, TaskORMSchema, TasksORMSession } from '../src/store/orm';
import { instancesKey } from '../src/store/orm/models';
import { fetchOrm } from '../src/store/orm/schema';
import { DEFAULT_SETTINGS, PluginSettings } from '../src/store/settings';
import { PluginState } from '../src/store/types';
import { createTestTaskLine } from './testUtils';

export const INITIAL_TASK_IDS = [ 1, 2, 3, 4, 5 ].map( i => i + 10000 );
export const helpers = {
    taskIdName( id: number ) {
        return `task with id ${id}`;
    },
    newTaskName( n: number ) {
        return `new task number ${n}`
    },
}
export const INITIAL_TASK_NAMES = INITIAL_TASK_IDS.map( id => `task with id ${id}` );
export const INITIAL_PARENTIDS: Record<number, number[]> = {
    2: [ 1 ],
    3: [ 1 ],
    5: [ 2, 4 ],
};
export const TAGS = [ [], [], [ 'tag1', 'tag2' ], [ 'tag1' ], [ 'tag3', 'tag2' ] ];
export const INITIAL_TASKS: Record<number, CreateProps<Task> & { id: number }> = INITIAL_TASK_IDS.reduce( (
    acc,
    id,
    i
) => {
    const props: CreateProps<Task> = {
        id,
        name: helpers.taskIdName( id ),
        complete: false,
        content: '',
        tags: TAGS[ i ],
        created: new Date().getTime(),
        dueDate: new Date().getTime(),
    }
    return {
        ...acc,
        [ id ]: props
    };
}, {} );
const TODAY = (new Date());
TODAY.setHours( 12, 0, 0, 0 );
const DAY_MS = 24 * 60 * 60 * 1000;
export const DUE_DATES = {
    TODAY,
    TOMORROW: new Date( TODAY.getTime() + DAY_MS ),
    FIVE_DAYS: new Date( TODAY.getTime() + 5 * DAY_MS )
};

// const NEW_TASK_NAMES = [ 1, 2, 3, 4, 5 ].map( i => `new task number ${i}` );
const FILES = [ 'file1.md', 'file2.md' ];
const LINES: Record<number, number[]> = {
    10001: [ 1, 2 ],
    10002: [ 2, -1 ],
    10003: [ 4, 3 ],
    10004: [ -1, 7 ],
    10005: [ 3, 8 ],
};
const PARENT_LINES = [ [ -1, -1, 1, 2, 1 ], [ -1, -1, -1, 2, -1, -1, -1, -1, 8 ] ];
const INITIAL_INSTANCES: CreateProps<TaskInstance>[] = Object.keys( LINES )
    .map( k => Number.parseInt( k ) ).sort()
    .reduce( ( insts, id ) => {
        const lines = LINES[ id ];
        const propsList: CreateProps<TaskInstance>[] = lines.reduce( ( acc, line, i ) => {
            if ( line < 0 )
                return acc;
            const file = FILES[ i ];
            const t = INITIAL_TASKS[ id ];
            const props: CreateProps<TaskInstance> = {
                key: instancesKey( file, line ),
                filePath: file,
                line,
                task: id,
                rawText: createTestTaskLine( id ),
                parentLine: PARENT_LINES[ i ][ line ],
                ...(LINES[ t.id ][ i ] && { parentInstance: instancesKey( file, LINES[ t.id ][ i ] ) })
            }
            return [ ...acc, props ];
        }, [] as Array<CreateProps<TaskInstance>> );
        return [ ...insts, ...propsList.filter( x => x ) ]
    }, [] as CreateProps<TaskInstance>[] )


export function createTestOrm() {
    const orm = new ORM<TaskORMSchema>();
    orm.register( Task, TaskInstance, Tag )
    return orm;
}

export const createTestSession: ( s?: Partial<PluginSettings> ) => {
    orm: ORM<TaskORMSchema>,
    state: PluginState,
    session: TasksORMSession
} = ( settings: Partial<PluginSettings> = {} ) => {
    const { orm, state: taskDb } = fetchOrm();
    return {
        orm,
        state: {
            settings: {
                ...DEFAULT_SETTINGS,
                ...settings,
            }, taskDb
        },
        session: orm.session( taskDb )
    }
}

export function createTestSessionWithData() {
    const orm = createTestOrm();
    const state = orm.getEmptyState();
    const {
        Task,
        TaskInstance
    } = orm.mutableSession( state );
    Object.keys( INITIAL_TASKS ).forEach( p => Task.create( INITIAL_TASKS[ Number.parseInt( p ) ] ) );
    INITIAL_INSTANCES.forEach( i => TaskInstance.create( i ) );

    const normalSession = orm.session( state );
    return { session: normalSession, orm, state };
}

export const taskLines = INITIAL_TASK_IDS.map( id => createTestTaskLine( id, id % 4 === 0 ) );

