enum TaskStatus {
    TODO,
    DONE
}

export interface Task {
    name: string;
    id: string;
    created: Date;
    updated: Date;
    description?: string;
    status: TaskStatus;
    parent?: Task;
    children?: Task[];
    duplicates?: Task[];
}

export interface TaskList {
    tasks: Record<string, Task>;
    createItem: (name: string) => void;
    deleteItem: (nameOrId: string) => void;
    completeItem: (nameOrId: string) => void;
    moveItem: (nameOrId: string, destination: string) => void;
}

export interface TaskLocation {
    file: 'backlog'|'completed';
    line: number;
}

/*
create task file
get task template

what's the goal? what's the mvp?
- just need to manipulate a backlog and completed file in response to creation, deletion, checking/unchecking of a task
- ensure its consistent and without duplicates
 */