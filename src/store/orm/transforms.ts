import { CreateProps, SessionBoundModel, UpdateProps } from 'redux-orm';
import {
    filterUnique,
    InstanceFields,
    ITask,
    removeUndefined,
    Task,
    TaskFields,
    TaskInstance,
    TaskProps
} from './index';
import { instancesKey, MTask, MTaskInstance, tagsEqual } from './models';
import { ITaskCreate, ITaskInstance } from './types';

export const taskCreatePropsFromITask = ( iTask: ITaskCreate ): CreateProps<Task> => {
    const {
        id,
        name,
        complete,
        tags,
        content,
        completed,
        created,
        dueDate
    } = iTask;

    return removeUndefined( {
        id,
        name,
        tags,
        complete,
        completed,
        dueDate,
        created,
        content,
    } );
}

export const instancePropsFromTask = (
    task: MTask,
    filePath: string,
    line = 0,
): CreateProps<TaskInstance> => {
    const key = instancesKey( filePath, line );
    const { parentTasks } = task;
    const pInsts = parentTasks?.toModelArray().reduce( ( acc, p ) => {
        const instMatch = p.instances.filter( i => i.filePath === filePath );
        if ( instMatch.exists() )
            acc.push( instMatch.first() );
        return [ ...acc ];
    }, [] as Array<MTaskInstance> )
    const parentInstance = pInsts.shift();
    return removeUndefined( {
        key,
        filePath,
        line,
        parentLine: parentInstance?.line || -1,
        parentInstance,
        task: task.id,
        rawText: task.name,
        parent: parentInstance?.task
    } );
}

export const instancePropsFromITaskInstance = ( instance: ITaskInstance ): CreateProps<TaskInstance> => {
    const {
        id,
        filePath,
        line,
        parentLine,
        parentInstance,
        rawText
    } = instance;

    return {
        key: instancesKey( instance ),
        rawText,
        parentLine,
        filePath,
        line,
        task: id,
        ...(parentInstance && {
                parentInstance: instancesKey( parentInstance ),
                parent: parentInstance.id
            }
        ),
    }
}

export const iTaskInstance = ( instRef: SessionBoundModel<TaskInstance, InstanceFields> ): ITaskInstance => {
    const {
        line,
        parentLine,
        filePath,
        parentInstance,
        rawText,
        task,
        subTaskInstances,
    } = instRef

    return {
        id: task.id,
        name: task.name,
        parentLine,
        ...(parentInstance && { parentInstance: iTaskInstance( parentInstance ) }),
        filePath,
        line,
        links: [],
        childLines: subTaskInstances.toRefArray().map( i => i.line ),
        completed: task.completed,
        complete: task.complete,
        tags: task.tags.toRefArray().map( t => t.name ),
        rawText
    }
}

export const iTask = ( mTask: SessionBoundModel<Task, TaskFields> ): ITask => {
    const {
        id,
        name,
        complete,
        completed,
        created,
        dueDate,
        instances,
        content
    } = mTask;

    return {
        id,
        name,
        complete,
        completed,
        childIds: mTask.subTasks.toRefArray().map( st => st.id ),
        parentIds: mTask.parentTasks.toRefArray().map( pt => pt.id ),
        tags: mTask.tags.toRefArray().map( t => t.name ),
        dueDate,
        created,
        instances: instances.toModelArray().map( iTaskInstance ),
        content
    }
}
export const taskCreatePropsFromInstance = ( {
    name,
    tags,
    complete,
    dueDate,
    completed,
}: ITaskInstance ): TaskProps => removeUndefined( {
    name,
    complete,
    tags,
    dueDate: dueDate ?? new Date().getTime(),
    completed: completed ?? complete ? new Date().getTime() : undefined,
    created: new Date().getTime(),
} );

export const taskUpdatePropsFromITaskInstance = (
    { name, complete, tags, dueDate }: ITaskInstance,
    task: SessionBoundModel<Task>
): UpdateProps<Task> => {
    const props: UpdateProps<Task> = removeUndefined( {
        name, complete,
        ...(dueDate && { dueDate }),
        tags: filterUnique( [
            ...task.tags.toModelArray(),
            ...tags
        ], tagsEqual ),
    } );
    if ( complete && !task.complete )
        props.completed = new Date().getTime();
    if ( !complete && task.completed ) {
        props.completed = undefined;
    }
    return props;
}