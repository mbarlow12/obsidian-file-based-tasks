import { FrontMatterCache } from 'obsidian';
import { ITaskInstanceYamlObject, ITaskYamlObject } from '../file';
import { ITask, ITaskInstance } from '../redux/orm';

export const readTaskYaml = ( yaml: ITaskYamlObject ): ITask => {
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
        completed,
    } = yaml;
    return {
        id: Number.parseInt( id ),
        name,
        complete: complete === 'true',
        created: new Date( created ).getTime(),
        instances: instances.map( taskInstanceFromYaml( yaml ) ),
        childIds: childIds.map( Number.parseInt ),
        parentIds: parentIds.map( Number.parseInt ),
        tags,
        dueDate: new Date( dueDate ).getTime(),
        ...(completed && completed.length && { completed: new Date( completed ).getTime() }),
        content: ''
    };
}
export const taskInstanceFromYaml = ( tYaml: ITaskYamlObject ) => ( yaml: ITaskInstanceYamlObject ): ITaskInstance => {
    const { id, name, dueDate, completed, tags } = tYaml
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
        ...(dueDate && dueDate.length && { dueDate: (new Date( dueDate )).getTime() }),
        ...(completed && completed.length && { completed: new Date( completed ).getTime() }),
        ...(links && links.length && { links }),
        childLines: childLines.map( ( c: string ) => Number.parseInt( c ) ),
    } as ITaskInstance;
}
export const taskYamlFromFrontmatter = ( cfm: FrontMatterCache ): ITaskYamlObject => {
    const {
        type,
        id,
        name,
        instances,
        complete,
        created,
        childIds,
        parentIds,
        dueDate,
        tags,
        completed
    } = cfm;
    return {
        type,
        id,
        name,
        tags,
        instances,
        complete,
        created,
        childIds,
        parentIds,
        dueDate,
        completed
    } as ITaskYamlObject;
}
