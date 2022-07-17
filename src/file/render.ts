import { stringifyYaml } from 'obsidian';
import { RRule } from 'rrule';
import { ITask, ITaskInstance } from '../redux/orm';
import { taskToBasename } from './index';
import { TaskInstanceYamlObject, TaskRecordType, TaskYamlObject } from './types';

export const renderTags = ( tags?: string[] ): string => (tags ?? []).join( ' ' );
export const renderRecurrence = ( rrule?: RRule ): string => rrule ? '&' + rrule.toText() : '';
export const renderDueDate = ( dueDate: Date ) => dueDate ? dueDate.toLocaleString() : '';

export const taskInstanceToChecklist = ( { complete, name, id }: ITaskInstance ): string => [
    `- [${complete ? 'x' : ' '}]`, name,
    `^${id}`
].join( ' ' );


export const renderTaskInstanceLinks = ( task: ITask ) => {
    return task.instances
        .filter( loc => !loc.filePath.includes( taskToBasename( task ) ) )
        .map( loc => `[[${loc.filePath}]]` ).join( ' ' );
};
export const taskToYamlObject = ( task: ITask ): TaskYamlObject => {
    const {
        id,
        name,
        complete,
        created,
        tags,
        dueDate,
        parentIds,
        childIds,
        instances,
        completedDate,
    } = task;
    return {
        type: TaskRecordType,
        id: `${id}`,
        name,
        complete: `${complete}`,
        created: created.toISOString(),
        tags,
        dueDate: dueDate.toISOString(),
        parentIds: parentIds.map( id => `${id}` ),
        childIds: childIds.map( id => `${id}` ),
        instances: instances.map( taskInstanceToYamlObject ),
        ...(completedDate && { completedDate: completedDate.toISOString() } )
    };
}
export const taskToTaskFileContents = ( task: ITask ): string => {
    const yamlObject = taskToYamlObject( task );
    const data = `---\n${stringifyYaml( yamlObject )}---\n${task.content || ''}`;
    return `${data}\n\n\n---\n${renderTaskInstanceLinks( task )}`;
}
export const taskAsChecklist = ( t: Pick<ITaskInstance, 'id' | 'name' | 'complete'> ) => `- [${t.complete
                                                                                              ? 'x'
                                                                                              : ' '}] ${t.name} ^${t.id}`;
export const taskFileLine = ( t: ITaskInstance, offset = 0 ) => new Array( offset ).fill( ' ' )
    .join( '' ) + taskAsChecklist( t );

export const taskInstanceToYamlObject = ( inst: ITaskInstance ): TaskInstanceYamlObject => {
    const {
        complete,
        rawText,
        filePath,
        line,
        parentLine,
        childLines,
        links
    } = inst;
    return {
        rawText,
        filePath,
        line: `${line}`,
        parentLine: `${parentLine}`,
        complete: complete.toString(),
        childLines: childLines.map(l => `${l}`),
        links
    }
}