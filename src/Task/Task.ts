// import {stringifyYaml} from "obsidian";
import { ITask, TaskLocation, TaskYamlObject, Yamlable} from "./types";

export class Task implements ITask, Yamlable {
    private _complete: boolean;
    private _name: string;
    private _description: string;
    private _children: string[];
    private _locations: TaskLocation[];
    private _created: number;
    private _updated: number;
    private _id: string;
    private _childRefs: Array<ITask>;

    public static fromITask(iTask: ITask) {
        return new Task(
            iTask.name,
            iTask.complete,
            iTask.locations,
            iTask.description,
            iTask.created,
            iTask.updated,
            iTask.children
        );
    }

    public static fromAnonymousTask({
                                        name,
                                        complete,
                                        children
                                    }: ITask, locations: TaskLocation[] = []): ITask {
        return {
            name,
            complete,
            children: (children || []),
            locations: [],
            created: Date.now(),
            updated: Date.now(),
        };
    }

    public static flatFromYamlObject({
                                         name,
                                         complete,
                                         locations = [],
                                         created,
                                         updated,
                                         children = []
                                     }: TaskYamlObject) {
        const task = new Task(name);
        task.complete = complete === 'true';
        task.locations = locations && locations.map(locStr => {
            const [filePath, line] = locStr.split(':');
            return {filePath, line: Number.parseInt(line)};
        });
        task.updated = Date.parse(updated);
        task.created = Date.parse(created);
        task.children = children;
        return task;
    }

    public static hash(task: ITask): string {
        const {
            name, complete, locations, children, description
        } = task;
        const ret: Record<string, string | boolean | TaskLocation[] | string[]> = {
            name, complete, locations
        };
        if (children)
            ret.children = [...children];
        if (description)
            ret.description = description;
        return JSON.stringify(ret);
    }

    constructor(name: string,
                complete: boolean = false,
                locs?: TaskLocation | TaskLocation[],
                description?: string,
                created?: string | Date | number,
                updated?: string | Date | number,
                children?: Array<ITask>|string[]) {
        this.name = name;
        this.complete = complete;
        this.locations = locs ? Array.isArray(locs) ? locs : [locs] : [];

        this.created = created ?
            created instanceof Date ?
                created.getTime() :
                typeof created === 'number' ?
                    created : (new Date(created)).getTime() :
            Date.now();

        this.updated = updated ?
            updated instanceof Date ?
                updated.getTime() :
                typeof updated === 'number' ?
                    updated : (new Date(updated)).getTime() :
            Date.now();
        this.description = description;
        if (children.length) {
            this.children = children.map(c => {
               if (typeof c !== 'string') {
                   return c.name;
               }
               return c;
            });
            this.childRefs = children.map(c => {
               if (typeof c === 'string')
                   return;
               return c;
            });
        }
    }

    public get children() {
        return this._children;
    }

    public set children(children: string[]) {
        this._children = children;
    }

    public addChild(t: ITask|string) {
        this._children.push(typeof t === 'string' ? t : t.name);
    }

    public removeChild(name: string): string | null {
        let i = this._children.findIndex(existing => existing === name);
        if (i !== -1)
            return this._children.splice(i, 1)[0];

        i = this._childRefs.findIndex(curr => curr.name === name);
        if (i !== -1)
            return this._childRefs.splice(i, 1)[0]['name'];

        return null;
    }

    public compareChildren({children}: ITask): string[][] {
        return this.compareTaskList(children);
    }

    private compareTaskList(tasks: string[]): string[][] {
        const thisNames: Set<string> = new Set(this.children);
        const result: Set<string> = new Set();
        for (const oChild of tasks) {
            if (!thisNames.has(oChild)) {
                result.add(oChild);
            } else {
                thisNames.delete(oChild);
            }
        }
        return [Array.from(thisNames), Array.from(result)];
    }

    get created(): number {
        return this._created;
    }

    set created(value: number) {
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

    get complete(): boolean {
        return this._complete;
    }

    set complete(value: boolean) {
        this._complete = value;
    }

    get updated(): number {
        return this._updated;
    }

    set updated(value: number) {
        this._updated = value;
    }

    get childRefs(): ITask[] {
        return this._childRefs;
    }

    set childRefs(children: ITask[]) {
        this._childRefs = children;
        this.children = this._childRefs.map(cr => cr.name);
    }

    get yamlObject() {
        const yamlObj: TaskYamlObject = {
            name: this.name,
            complete: `${this.complete}`,
            locations: this._locations.map(l => `${l.filePath}:${l.line}`),
            created: this.created.toLocaleString(),
            updated: this.updated.toLocaleString(),
            children: this.children || []
        };
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
        const x = task.complete ? 'x' : ' ';
        let contents = [`- [${x}] ${task.name}`];
        for (const child of task.childRefs) {
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