import { attr, CreateProps, fk, IdOrModelLike, many, Model, MutableQuerySet, QuerySet } from 'redux-orm';
import { ITask } from './types';

export type TaskFields = Omit<ITask, 'instances' | 'parentIds' | 'childIds' | 'tags'> & {
    instances?: QuerySet<TaskInstance>,
    parentTasks?: QuerySet<Task>,
    subTasks?: QuerySet<Task>,
    subTaskInstances?: QuerySet<TaskInstance>,
    dueDate: Date,
    tags: MutableQuerySet<Tag>,
}

export type TaskProps = CreateProps<Task, TaskFields>;

export const MIN_ID = 10000;

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
        completedDate: attr(),
        dueDate: attr( { getDefault: () => new Date() } ),
        tags: many( 'Tag', 'tasks' ),
        parentTasks: many( {
            to: 'this',
            relatedName: 'subTasks',
            through: 'TaskInstance',
            throughFields: [ 'parent', 'task' ]
        } ),
        created: attr( { getDefault: () => new Date() } ),
    }

    // static create<M extends AnyModel, TProps extends CreateProps<M>>(userProps: TProps): SessionBoundModel<M,
    // TProps> { // @ts-ignore this.nextId = Math.max(userProps.id, this.nextId) + 1; return super.create({
    // ...userProps, id: this.nextId++ }); }
}

export interface InstanceFields {
    key: string;
    task: Task;
    filePath: string;
    line: number;
    rawText: string;
    parentLine: number;
    parentInstance?: TaskInstance;
    parent?: Task;
    subTaskInstances?: QuerySet<TaskInstance>;
}

export type InstanceProps = CreateProps<TaskInstance>;
export type MinInstanceProps =
    Omit<CreateProps<TaskInstance>, 'key' | 'parentLine'>
    & { key?: string, parentLine?: number }

export class TaskInstance extends Model<typeof TaskInstance, InstanceFields> {
    private fields: InstanceFields;

    static modelName = 'TaskInstance' as const;

    static options = {
        idAttribute: 'key' as const
    };

    static fields = {
        key: attr(),
        task: fk( 'Task', 'instances' ),
        filePath: attr(),
        line: attr(),
        rawText: attr(),
        parentLine: attr(),
        parentInstance: fk( 'this', 'subTaskInstances' ),
        parent: fk( 'Task', 'subTaskInstances' ),
    };

    // todo: add create method to handle key creation

    constructor( props: InstanceFields ) {
        super( props );
        this.fields = { ...props };
    }
}

export interface TagFields {
    name: string,
    tasks?: QuerySet<Task>,
}

export class Tag extends Model<typeof Tag, TagFields> {
    static modelName = 'Tag' as const;
    static fields = {
        name: attr(),
    }
    static options = {
        idAttribute: 'name' as const
    }

    constructor( props: TagFields ) {
        super( props );
    }
}

export const tagsEqual = ( a: IdOrModelLike<Tag>, b: IdOrModelLike<Tag> ) => {
    if ( typeof a !== 'string' )
        a = a.getId();
    if ( typeof b !== 'string' )
        b = b.getId()
    return a === b;
}