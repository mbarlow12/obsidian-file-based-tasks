import { ITask, ITaskInstance } from './types';

export const INSTANCE_KEY_DELIM = '||';

export const filterUnique = <T>(
    arr: T[],
    comp: ( a: T, b: T ) => boolean = (a: T, b: T) => a === b
) => arr.filter(
    ( elem, i ) => arr.findIndex( search => comp( elem, search ) ) === i
);

export const instancesKey = (
    pathOrInst: string | ITaskInstance,
    line = 0,
    delimiter = INSTANCE_KEY_DELIM
) => {
    if ( typeof pathOrInst !== 'string' ) {
        line = pathOrInst.line;
        pathOrInst = pathOrInst.filePath;
    }
    return [ pathOrInst, line ].join( delimiter )
};



export type {
    UpdateFileInstanesAction,
    CreateTaskAction,
    CompleteTaskAction,
    DeleteFileAction,
    DeleteTaskAction,
    RehydrateAction,
    RefreshRecurrencesAction,
    RenameFileAction,
    UnarchiveTasksAction,
    ArchiveTasksAction,
    TaskAction,
    UncompleteTaskAction,
    UpdateTaskAction
} from './actions';
export { TaskActionType, addInstancesFromFile, createTask } from './actions';
export { reducerCreator } from './reducer';
export type {
    TasksORMSession,
    TaskORMSchema,
    TasksORMState
} from './schema';
export type {
    TagFields,
    TaskProps,
    TaskFields,
    InstanceFields,
    InstanceProps,
    MinInstanceProps
} from './models';
export {
    Task,
    Tag,
    TaskInstance
} from './models';
export type {
    ITaskBase,
    IBaseTask,
    ITaskCreate,
    ITask,
    ITaskInstanceRecord,
    ITaskInstance,
    RefFilter
} from './types'
export * from './selectors';
export * from './transforms';
export const emptyTaskInstance = (): ITaskInstance => {
    return {
        id: 0,
        complete: false,
        name: '',
        parentLine: -1,
        line: 0,
        links: [],
        tags: [],
        rawText: '',
        filePath: '',
        childLines: [],
    };
};
export const emptyTask = (): ITask => {
    const { id, complete, name } = emptyTaskInstance();
    return {
        id,
        name,
        complete,
        created: new Date(),
        content: '',
        instances: [],
        childIds: [],
        tags: [],
        parentIds: [],
        dueDate: new Date()
    }
}