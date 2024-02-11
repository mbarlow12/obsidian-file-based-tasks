import { Task } from '../models';

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

export type MTaskInstance = SessionBoundModel<TaskInstance>;

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