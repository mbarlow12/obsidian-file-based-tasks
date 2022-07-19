import { createDraftSafeSelector, createSelector, Selector } from '@reduxjs/toolkit';
import { ModelType, ORM } from 'redux-orm';
import { PluginState } from '../types';
import { Task, TaskInstance } from './models';
import { TaskORMSchema, TasksORMSession, TasksORMState } from './schema';
import { iTaskInstance } from './transforms';
import { RefFilter } from './types';

const ormSelector = <R>( selector: Selector<TasksORMState, R, [ ORM<TaskORMSchema> ]> ) => (
    s: TasksORMState,
    orm: ORM<TaskORMSchema>
) => selector( s, orm );

export const sessionSelect = createDraftSafeSelector( [
        ( s: TasksORMState ) => s,
        ( _, orm: ORM<TaskORMSchema> ) => orm
    ],
    ( state: TasksORMState, orm ) => orm.session( state )
);

export const sessionTask = createDraftSafeSelector(
    ormSelector( sessionSelect ),
    ( arg: TasksORMSession ) => arg.Task
);

export const sessionTaskInstance = createDraftSafeSelector(
    ( s: TasksORMState, orm: ORM<TaskORMSchema> ) => sessionSelect( s, orm ).TaskInstance,
    arg => arg
);


export const allTasks = createDraftSafeSelector(
    ormSelector( sessionTask ),
    ( task: ModelType<Task> ) => task.all()
);

export const allTaskFiles = createSelector(
    ( state: PluginState, orm: ORM<TaskORMSchema> ) => orm.session( state.taskDb ),
    ( session ) => session.TaskInstance.all()
        .toRefArray()
        .map( i => i.filePath )
        .filter( ( inst, i, arr ) => arr.indexOf( inst ) === i ) );

export const getTask = createDraftSafeSelector(
    [
        ( s: TasksORMState ) => s,
        ( s: TasksORMState, orm: ORM<TaskORMSchema> ) => sessionTask( s, orm ),
    ],
    ( state: TasksORMState, task: ModelType<Task> ) => ( id: number ) => task.withId( id )
);

export const nextTaskId = createDraftSafeSelector(
    ( s: TasksORMState, orm: ORM<TaskORMSchema> | TasksORMSession ) => ('Task' in orm
                                                                        ? orm.Task
                                                                        : sessionTask( s, orm )).all().toRefArray(),
    tasks => Math.max( ...tasks.map( t => t.id ) ) + 1
);

export const taskParents = createDraftSafeSelector(
    ( s: TasksORMState, orm: ORM<TaskORMSchema> ) => sessionTask( s, orm ),
    ( _: TasksORMState, id: number ) => id,
    ( task: ModelType<Task>, id: number ) => task.withId( id )?.parentTasks?.all()
);

// export const getNextTaskIdAboveMin = ( minId = 0 ) => createDraftSafeSelector(
//     ( ormState: TasksORMState, orm: ORM<TaskORMSchema> | TasksORMSession ) => nextTaskId( ormState, orm ),
//     ( id: number ) => Math.max( id, minId )
// );

export const getNextTaskIdAboveMin = ( state: TasksORMState, session: TasksORMSession, miniId = 0 ) => {
    const nextId = nextTaskId( state, session );
    return Math.max( miniId, nextId );
}

export const taskInstances = createDraftSafeSelector(
    ( s: TasksORMState, orm: ORM<TaskORMSchema> ) => sessionTask( s, orm ),
    ( task: ModelType<Task> ) => ( id: number ) => {
        const t = task.withId( id );
        if ( t ) {
            if ( t.instances?.exists() )
                return t.instances;
        }
    }
);

export const filePathInstances = createDraftSafeSelector(
    (
        s: TasksORMState,
        orm: ORM<TaskORMSchema> | TasksORMSession
    ) => 'TaskInstance' in orm ? orm.TaskInstance : sessionTaskInstance( s, orm ),
    ( taskInstance: ModelType<TaskInstance>, ) =>
        ( path: string ) => taskInstance.filter( ( i ) => i.filePath === path )
);

export const pathITaskInstances = createSelector(
    filePathInstances,
    (instances) => (path: string) => instances( path )
        .orderBy('line')
        .toModelArray()
        .map(iTaskInstance)
);


export const queryTasks = createDraftSafeSelector(
    ormSelector( sessionTask ),
    ( _: TasksORMState, comparator: RefFilter<Task> ) => comparator,
    ( task: ModelType<Task>, comp: RefFilter<Task> ) => task.filter( comp )
);

export const queryInstances = createDraftSafeSelector(
    ormSelector( sessionTaskInstance ),
    ( _: TasksORMState, comparator: RefFilter<TaskInstance> ) => comparator,
    ( taskInstance: ModelType<TaskInstance>, comp: RefFilter<TaskInstance> ) => taskInstance.filter( comp )
);