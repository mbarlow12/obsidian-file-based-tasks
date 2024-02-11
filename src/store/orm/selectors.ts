import { PluginState } from '../types';
import { MTask, Task, TaskInstance } from './models';
import { TaskORMSchema, TasksORMSession, TasksORMState } from './schema';
import { iTaskInstance } from './transforms';

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


export const allTasks = createSelector(
    ( state: TasksORMState, orm: ORM<TaskORMSchema> ) => orm.session( state ).Task,
    ( task: ModelType<Task> ) => task.all()
);

export const searchTasks = createSelector(
    (
        state: TasksORMState,
        orm: ORM<TaskORMSchema>
    ) => createOrmSelector( orm, ( state: TasksORMState ) => state, session => session.Task )( state ),
    (
        state: TasksORMState,
        search: string
    ) => search,
    ( tasks, search ) => {
        return tasks.filter( t => t.name.includes( search ) ).all().toModelArray();
    }
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
    ( s: TasksORMState ) => s.Task.items,
    tasks => Math.max( ...tasks, 0 ) + 1
);

export const taskParents = createDraftSafeSelector(
    ( s: TasksORMState, orm: ORM<TaskORMSchema> ) => sessionTask( s, orm ),
    ( _: TasksORMState, id: number ) => id,
    ( task: ModelType<Task>, id: number ) => task.withId( id )?.parentTasks?.all()
);

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
        session: TasksORMSession
    ) => session.TaskInstance,
    ( taskInstance: ModelType<TaskInstance>, ) =>
        ( path: string ) => taskInstance.filter( ( i ) => i.filePath === path )
);

export const pathITaskInstances = createSelector(
    ( s: TasksORMState, orm: ORM<TaskORMSchema> ) => filePathInstances( s, orm.session( s ) ),
    ( instances ) => ( path: string ) => instances( path )
        .orderBy( 'line' )
        .toModelArray()
        .map( iTaskInstance )
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

export const subTaskTree = createSelector(
    [
        ( s: TasksORMState ) => s,
        (
            s: TasksORMState,
            arg: { session: TasksORMSession, id: number }
        ): [ ModelType<Task>, number ] => [ arg.session.Task, arg.id ],
    ],
    ( state, [ task, id ] ) => {
        const t = task.withId( id );
        return [ ...t.subTasks.all().toModelArray() ].reduce( ( acc, st, _, arr ) => {
            const subs = st.subTasks.all().toModelArray();
            if ( subs.length > 0 )
                arr.push( ...subs.filter( s => s.subTasks.exists() ) );
            return acc.concat( [ st ].concat( subs ) );
        }, [] as MTask[] )
    }
);