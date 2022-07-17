import { CreateProps, SessionBoundModel, UpdateProps } from 'redux-orm';
import { filterUnique, instancesKey } from './index';
import { tagsEqual, Task, TaskInstance, TaskProps } from './models';
import { ITaskCreate, ITaskInstance } from './types';

export const taskCreatePropsFromITask = ( iTask: ITaskCreate ): CreateProps<Task> => {
    const {
        id,
        name,
        complete,
        tags,
        content,
        completedDate,
        created,
        dueDate
    } = iTask;

    return {
        id,
        name,
        tags,
        complete,
        completedDate,
        dueDate,
        created,
        content,
    }
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
export const taskCreatePropsFromInstance = ( {
    name,
    tags,
    complete,
    id,
    dueDate,
    completedDate,
}: ITaskInstance ): TaskProps => ({
    id,
    name,
    complete,
    tags,
    dueDate: dueDate ?? new Date(),
    completedDate: completedDate || (complete && new Date()) || undefined,
    created: new Date(),
});

export const taskUpdatePropsFromITaskInstance = (
    { name, complete, tags, dueDate }: ITaskInstance,
    task: SessionBoundModel<Task>
): UpdateProps<Task> => {
    const props: UpdateProps<Task> = {
        name, complete, dueDate,
        tags: filterUnique( [
            ...task.tags.toModelArray(),
            ...tags
        ], tagsEqual ),
    };
    if ( complete && !task.complete )
        props.completedDate = new Date();
    if ( !complete && task.completedDate ) {
        props.completedDate = undefined;
    }
    return props;
}