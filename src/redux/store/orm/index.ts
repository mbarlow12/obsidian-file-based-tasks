import { ITaskInstance } from './types';

export const DEFAULT_KEY_DELIMITER = '||';

export const filterUnique = <T>(
    arr: T[],
    comp: ( a: T, b: T ) => boolean = (a: T, b: T) => a === b
) => arr.filter(
    ( elem, i ) => arr.findIndex( search => comp( elem, search ) ) === i
);

export const instancesKey = (
    pathOrInst: string | ITaskInstance,
    line = 0,
    delimiter = DEFAULT_KEY_DELIMITER
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
