import { attr, CreateProps, many, Model, MutableQuerySet, QuerySet } from 'redux-orm';
import { ITask } from '../types';
import { MIN_ID, Tag, TaskInstance } from './index';

export type TaskFields = Omit<ITask, 'instances' | 'parentIds' | 'childIds' | 'tags'> & {
    instances?: QuerySet<TaskInstance>,
    parentTasks?: QuerySet<Task>,
    subTasks?: QuerySet<Task>,
    subTaskInstances?: QuerySet<TaskInstance>,
    dueDate: number,
    tags: MutableQuerySet<Tag>,
}
export type TaskProps = CreateProps<Task, TaskFields>;

export class Task extends Model<typeof Task, TaskFields> {
    private fields: TaskFields;
    private static nextId = MIN_ID;

    constructor( fields: TaskFields ) {
        super( fields );
        this.fields = fields;
    }

    static modelName = 'Task' as const;

    static fields = {
        name: attr(),
        content: attr( { getDefault: () => '' } ),
        complete: attr( { getDefault: () => false } ),
        completed: attr(),
        dueDate: attr( { getDefault: () => new Date().getTime() } ),
        tags: many( 'Tag', 'tasks' ),
        parentTasks: many( {
            to: 'this',
            relatedName: 'subTasks',
            through: 'TaskInstance',
            throughFields: [ 'parent', 'task' ]
        } ),
        created: attr( { getDefault: () => new Date().getTime() } ),
    }

    // static create<M extends AnyModel, TProps extends CreateProps<M>>(userProps: TProps): SessionBoundModel<M,
    // TProps> { // @ts-ignore this.nextId = Math.max(userProps.id, this.nextId) + 1; return super.create({
    // ...userProps, id: this.nextId++ }); }
}