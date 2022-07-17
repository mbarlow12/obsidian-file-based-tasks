import { TaskInstanceYamlObject, TaskYamlObject } from '../file';
import { ITask, ITaskInstance } from '../redux/orm';

export const readTaskYaml = ( yaml: TaskYamlObject ): ITask => {
    const {
        complete,
        id,
        name,
        created,
        parentIds,
        childIds,
        instances,
        tags,
        dueDate,
        completedDate,
    } = yaml;
    return {
        id: Number.parseInt( id ),
        name,
        complete: complete === 'true',
        created: new Date( created ),
        instances: instances.map( taskInstanceFromYaml( yaml ) ),
        childIds: childIds.map( Number.parseInt ),
        parentIds: parentIds.map( Number.parseInt ),
        tags,
        dueDate: new Date(dueDate),
        ...(completedDate && completedDate.length && { completedDate: new Date( completedDate ) }),
        content: ''
    };
}
export const taskInstanceFromYaml = ( tYaml: TaskYamlObject ) => ( yaml: TaskInstanceYamlObject ): ITaskInstance => {
    const { id, name, dueDate, completedDate, tags } = tYaml
    const { rawText, filePath, complete, links, line, parentLine, childLines } = yaml;
    return {
        id: Number.parseInt( id ),
        name,
        rawText,
        filePath,
        line: Number.parseInt( line ),
        parentLine: Number.parseInt( parentLine ),
        complete: complete === 'true',
        ...(tags && tags.length && { tags }),
        ...(dueDate && dueDate.length && { dueDate: new Date( dueDate ) }),
        ...(completedDate && completedDate.length && { completedDate: new Date( completedDate ) }),
        ...(links && links.length && { links }),
        childLines: childLines.map( (c: string) => Number.parseInt( c ) ),
    } as ITaskInstance;
}