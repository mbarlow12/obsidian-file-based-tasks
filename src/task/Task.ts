import { TaskInstance } from "task/TaskInstance";
import { TaskData, TaskRenderingData } from "task/types";

export class Task implements TaskData {
	static DEFAULTS: {
		id: -1;
		name: "__DEFAULT_NAME__";
		complete: false;
	};
	private instance_data: TaskRenderingData[];

	public readonly id: number;
	public readonly created: number;
	public readonly updated: number;
	public readonly completedDate?: number;

	public name: string;
	public content?: string;
	public complete: boolean;
	public parentIds: number[];
	public childIds: number[];
	public dueDate?: number;
	public tags?: string[];

	constructor(data: TaskData, instance_data?: TaskRenderingData[]) {
		this.id = data.id;
		this.name = data.name;
		this.content = data.content;
		this.complete = data.complete;
		this.created = data.created;
		this.updated = data.updated;
		this.parentIds = data.parentIds;
		this.childIds = data.childIds;
		if (data.dueDate) this.dueDate = data.dueDate;
		if (data.completedDate) this.completedDate = data.completedDate;
		if (data.tags) this.tags = data.tags;

		this.instance_data = instance_data || [];
	}

	public get instances() {
		return this.instance_data.map((data) => new TaskInstance(data));
	}

	public addInstance(instance: TaskRenderingData) {
		this.instance_data.push(instance);
	}

	public static createEmpty() {
		new Task({
			...this.DEFAULTS,
			id: -1,
			name: "",
			created: Date.now(),
			updated: Date.now(),
			parentIds: [],
			childIds: [],
		});
    }
    
    public static createFromInstance(instance: TaskRenderingData) {
        new Task({
            id: instance.taskId,
            name: 
        },
        [instance]
        )
    }
}
