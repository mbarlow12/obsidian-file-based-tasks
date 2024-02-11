export interface TaskData {
    id: number;
    name: string;
    content?: string;
    complete: boolean;
    completedDate?: number;
    created: number;
    updated: number;
    parentIds: number[];
    childIds: number[];
    dueDate?: number;
    tags?: string[];
}


export interface TaskRenderingData {
    taskId: number;
    rawText: string;
    filePath: string;
    line: number;
    parentLine: number;
    childLines?: number[];
    links: string[];
}

export interface EmptyTask {
    id: number;
    name: string;
    complete: boolean;
    tags: string[];
    completed?: number;
}

export interface BaseTask extends EmptyTask {
    content: string;
    created: number;
    parentIds: number[];
    childIds: number[];
}

export interface OldTaskInstance extends EmptyTask {
    rawText: string;
    filePath: string;
    line: number;
    parentLine: number;
    parentInstance?: OldTaskInstance;
    childLines: number[];
    instanceChildren?: OldTaskInstance[];
    dueDate?: number;
    links: string[];
}

export interface OldTask extends BaseTask {
    dueDate: number;
    instances: OldTaskInstance[];
}

