import { OldTask } from "task/types";
import { OldTaskInstance } from "task/types";
import { MIN_ID, Tag, TaskInstance } from './index';

export class Task implements OldTask {
    dueDate: number;
    instances: OldTaskInstance[];
    content: string;
    created: number;
    parentIds: number[];
    childIds: number[];
    id: number;
    name: string;
    complete: boolean;
    tags: string[];
    completed?: number;
    
    constructor() {
        
    }
    
    static create() {
        return new Task()
    }
}

// export class Task extends Model<typeof Task, TaskFields> {
//     private fields: TaskFields;
//     private static nextId = MIN_ID;

//     constructor( fields: TaskFields ) {
//         super( fields );
//         this.fields = fields;
//     }

//     static modelName = 'Task' as const;

//     static fields = {
//         name: attr(),
//         content: attr( { getDefault: () => '' } ),
//         complete: attr( { getDefault: () => false } ),
//         completed: attr(),
//         dueDate: attr( { getDefault: () => new Date().getTime() } ),
//         tags: many( 'Tag', 'tasks' ),
//         parentTasks: many( {
//             to: 'this',
//             relatedName: 'subTasks',
//             through: 'TaskInstance',
//             throughFields: [ 'parent', 'task' ]
//         } ),
//         created: attr( { getDefault: () => new Date().getTime() } ),
//     }

//     // static create<M extends AnyModel, TProps extends CreateProps<M>>(userProps: TProps): SessionBoundModel<M,
//     // TProps> { // @ts-ignore this.nextId = Math.max(userProps.id, this.nextId) + 1; return super.create({
//     // ...userProps, id: this.nextId++ }); }
// }