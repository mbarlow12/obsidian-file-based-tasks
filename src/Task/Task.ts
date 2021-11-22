// import {stringifyYaml} from "obsidian";
import {IAnonymousTask, ITask, TaskLocation, TaskStatus, TaskYamlObject, Yamlable} from "./types";

export class Task implements ITask, Yamlable {
    private _status: TaskStatus;
    private _name: string;
    private _description: string;
    private _children: ITask[];
    private _parents: ITask[];
    private _locations: TaskLocation[];
    private _created: Date;
    private _updated: Date;
    private _id: string;

    public static fromITask(iTask: ITask) {
        return new Task(
            iTask.name,
            iTask.status,
            iTask.locations,
            iTask.description,
            iTask.created,
            iTask.updated,
            iTask.parents,
            iTask.children
        );
    }

    public static fromAnonymousTask({
                                        name,
                                        status,
                                        parents,
                                        children
                                    }: IAnonymousTask, locations: TaskLocation[] = []): ITask {
        return {
            name,
            status,
            parents: (parents || []).map(p => Task.fromAnonymousTask(p)),
            children: (children || []).map(p => Task.fromAnonymousTask(p)),
            locations: [],
            created: new Date(),
            updated: new Date(),
        };
    }

    public static flatFromYamlObject({
                                         name,
                                         status,
                                         locations = [],
                                         created,
                                         updated,
                                         parents,
                                         children
                                     }: TaskYamlObject) {
        const task = new Task(name);
        task.status = status === `DONE` ? TaskStatus.DONE : TaskStatus.TODO;
        task.locations = locations && locations.map(locStr => {
            const [filePath, line] = locStr.split(':');
            return {filePath, line: Number.parseInt(line)};
        });
        task.updated = new Date(updated);
        task.created = new Date(created);
        task.parents = (parents || []).map(p => new Task(p));
        task.children = (children || []).map(cName => new Task(cName));
        return task;
    }

    public static hash(task: ITask): string {
        const {
            name, status, locations, parents, children, description
        } = task;
        const ret: Record<string, string | TaskStatus | TaskLocation[] | string[]> = {
            name, status, locations
        };
        if (parents)
            ret.parents = parents.map(p => p.name);
        if (children)
            ret.children = children.map(c => c.name);
        if (description)
            ret.description = description;
        return JSON.stringify(ret);
    }

    constructor(name: string,
                status?: TaskStatus,
                locs?: TaskLocation | TaskLocation[],
                description?: string,
                created?: string | Date,
                updated?: string | Date,
                parents?: ITask[],
                children?: ITask[]) {
        this.name = name;
        this.status = status ?? TaskStatus.TODO;
        this.locations = locs ? Array.isArray(locs) ? locs : [locs] : [];
        this.created = created ?
            created instanceof Date ? created : new Date(created) :
            new Date();
        this.updated = updated ?
            updated instanceof Date ? updated : new Date(updated) :
            new Date();
        this.description = description;
        this.parents = parents;
        this.children = children;
    }

    public get children() {
        return this._children;
    }

    public set children(children: ITask[]) {
        this._children = children;
    }

    public addChild(t: ITask) {
        this._children.push(t);
    }

    public removeChild({name}: ITask): ITask | null {
        const i = this._children.findIndex(({name: existing}) => existing === name);
        if (i !== -1)
            return this._children.splice(i, 1)[0]
        return null;
    }

    public compareChildren({children}: ITask): string[][] {
        return this.compareTaskList(children);
    }

    public compareParents({parents}: ITask): string[][] {
        return this.compareTaskList(parents);
    }

    private compareTaskList(tasks: ITask[]): string[][] {
        const thisNames: Set<string> = new Set(this.children.map(c => c.name));
        const result: Set<string> = new Set();
        for (const oChild of tasks) {
            if (!thisNames.has(oChild.name)) {
                result.add(oChild.name);
            } else {
                thisNames.delete(oChild.name);
            }
        }
        return [Array.from(thisNames), Array.from(result)];
    }

    get created(): Date {
        return this._created;
    }

    set created(value: Date) {
        this._created = value;
    }

    get description(): string {
        return this._description;
    }

    set description(value: string) {
        this._description = value;
    }

    get locations(): TaskLocation[] {
        return this._locations;
    }

    set locations(value: TaskLocation[]) {
        this._locations = value;
    }

    public addLocation(loc: TaskLocation) {
        if (!this.hasLocation(loc))
            this._locations.push(loc);
    }

    public removeLocation(loc: TaskLocation) {
        const i = this._locations.findIndex(({filePath, line}) => filePath === loc.filePath && line === loc.line);
        if (i !== -1)
            return this._locations.splice(i, 1)[0];
        return null;
    }

    public hasLocation(loc: TaskLocation) {
        const i = this._locations
            .findIndex(({filePath, line}) => filePath === loc.filePath && line === loc.line);
        return i > -1;
    }

    get name(): string {
        return this._name;
    }

    set name(value: string) {
        this._name = value;
    }

    get parents(): ITask[] {
        return this._parents;
    }

    set parents(value: ITask[]) {
        this._parents = value;
    }

    addParent(p: ITask) {
        this._parents.push(p)
    }

    removeParent(p: ITask) {
        const foundIndex = this._parents.findIndex(parent => parent.name === p.name);
        if (foundIndex !== -1) {
            return this._parents.splice(foundIndex, 1)[0];
        }
        return null;
    }


    get status(): TaskStatus {
        return this._status;
    }

    set status(value: TaskStatus) {
        this._status = value;
    }

    get updated(): Date {
        return this._updated;
    }

    set updated(value: Date) {
        this._updated = value;
    }

    get yamlObject() {
        const yamlObj: TaskYamlObject = {
            name: this.name,
            status: `${this.status}`,
            locations: this._locations.map(l => `${l.filePath}:${l.line}`),
            created: this.created.toLocaleString(),
            updated: this.updated.toLocaleString(),
        };
        if (this.parents)
            yamlObj.parents = this.parents.map(p => p.name);
        if (this.children)
            yamlObj.children = this.children.map(c => c.name);
        return yamlObj;
    }

    public static toYamlString(task: ITask): string {
        // return stringifyYaml(Task.fromITask(task).yamlObject);
        return '';
    }

    public toFileContents() {
        // const yaml = stringifyYaml(this.yamlObject);
        // return `${yaml}\n${this.description}`;
        return '';
    }

    public static asChecklist(task: ITask, colWidth: number = 4): string[] {
        const x = task.status === TaskStatus.DONE ? 'x' : ' ';
        let contents = [`- [${x}] ${task.name}`];
        for (const child of task.children) {
            const childChecklistLines = Task.asChecklist(child, colWidth)
                .map(line => Array(colWidth).fill(' ').join('') + line);
            contents.push(...childChecklistLines);
        }
        return contents;
    }

    public static isTask(task: ITask): task is Task {
        return Object.getOwnPropertyNames(task).includes('yamlObject');
    }
}

/*
create task file
get task template

what's the goal? what's the mvp?
- just need to manipulate a backlog and completed file in response to creation, deletion, checking/unchecking of a task
- ensure its consistent and without duplicates
 */