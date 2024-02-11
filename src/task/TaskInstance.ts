import { TaskRenderingData } from "./types";

export class TaskInstance {
    
    private data: TaskRenderingData;

    constructor(data: TaskRenderingData) {
        this.data = data
    }
}