import {BaseTask, ITask, ITaskTree, TaskLocation, TaskRecordType, TaskYamlObject, Yamlable} from "./types";
import {stringifyYaml, TFile} from "obsidian";
import {taskLocationStr, taskLocFromStr} from "./index";
import {hash} from "../util/hash";

const taskFileNameRegex = /^(?<name>\w.*)(?= - \d+) - (?<id>\d+)(?:.md)?/;

export const emptyTask: () => ITask = () => {
    return {
        id: -1,
        complete: false,
        name: '',
        locations: [],
        created: Date.now(),
        updated: Date.now(),
        children: [],
    };
};

export const getTaskFromYaml = (yaml: TaskYamlObject): ITask => {
    const {
        complete, id, locations, children, name, created, updated
    } = yaml;
    return {
        id: Number.parseInt(id),
        name,
        complete: complete === 'true',
        created: Date.parse(created),
        updated: Date.parse(updated),
        locations: locations.map(taskLocFromStr),
        children: children.map(c => Number.parseInt(c))
    };
}

export const taskToYamlObject = (task: ITask): TaskYamlObject => {
    const {id, name, complete, locations, created, updated, children} = task
    return {
        type: TaskRecordType,
        id: `${id}`,
        name,
        complete: `${complete}`,
        locations: locations.map(taskLocationStr),
        created: (new Date(created)).toLocaleString(),
        updated: (new Date(updated)).toLocaleString(),
        children: (children || []).map(c => `${c}`)
    };
}

export const taskToBasename = (task: ITask) => `${task.name} - ${task.id}`;
export const taskToFilename = (task: ITask) => `${taskToBasename(task)}.md`;

export const isFilenameValid = (f: TFile): boolean => {
    const match = f.basename.match(taskFileNameRegex);
    if (!match)
        return false

    if (!match.groups.hasOwnProperty('name'))
        return false;

    if (!match.groups.hasOwnProperty('id'))
        return false;

    return true;
}

export const parseTaskFilename = (f: TFile) => {
    const match = f.basename.match(taskFileNameRegex);
    const {name, id} = match.groups;
    return {name, id};
};

export const taskToFileContents = (task: ITask): string => {
    const yamlObject = taskToYamlObject(task);
    return `---\n${stringifyYaml(yamlObject)}---\n${task.description || ''}`;
}

export const taskToJsonString = (task: ITask): string => {
    const {
        name, complete, locations, children, description, created
    } = task;
    const ret: Record<string, string | boolean | TaskLocation[] | string[]> = {
        name, complete, created: `${created}`
    };
    ret.locations = locations.sort((a, b) => {
        let comp = a.filePath.localeCompare(b.filePath);
        if (comp === 0) {
            return a.lineNumber - b.lineNumber;
        }
        return comp;
    });
    if (children)
        ret.children = children.sort().map(c => `${c}`);
    if (description)
        ret.description = description.trim();
    return JSON.stringify(ret);
}

export const hashTask = async (task: ITask): Promise<string> => {
    return await hash(taskToJsonString(task));
}

export const taskAsChecklist = (t: BaseTask) => `- [${t.complete ? 'x' : ' '}] ${t.name} ^${t.id}`;

export const taskFileLine = (t: BaseTask, offset: number = 0) => new Array(offset).fill(' ').join('') + taskAsChecklist(t);

export const fullTaskChecklist = (t: ITaskTree, offset: number = 0): string => {
    const lines: string[] = [taskFileLine(t, offset)];
    lines.push(...t.children.map( c => fullTaskChecklist(c, offset + 2)))
    return lines.join('\n');
}

/**
 * if both rets are empty, children are identical
 * if ret[0] is empty, taskB has added child task ids
 * if ret[1] is empty, taskB has deleted child task ids
 * if neither are empty, taskA's ids were deleted and taskB's were added
 *
 * @param taskA
 * @param taskB
 * @return Array - [child ids in A not in B, child ids in B not in A]
 */
export const compareTaskChildren = (taskA: ITask, taskB: ITask): [number[], number[]] => {
    return compareArrays(taskA.children, taskB.children);
};

export const compareTaskLocations = (first: ITask, second: ITask): [TaskLocation[], TaskLocation[]] => {
    return compareArrays(first.locations, second.locations);
}

export const compareArrays = <T>(first: T[], second: T[]): [T[], T[]] => {
    const firstItems = new Set<T>(first);
    const secondItems = new Set<T>();
    for (const si of second) {
        if (!firstItems.has(si)) {
            secondItems.add(si);
        } else {
            firstItems.delete(si);
        }
    }
    return [Array.from(firstItems), Array.from(secondItems)];
};

export class Task implements ITask, Yamlable {
    private _complete: boolean;
    private _name: string;
    private _description: string;
    private _children: number[];
    private _locations: TaskLocation[];
    private _created: number;
    private _updated: number;
    private _id: number;
    private _childRefs: Array<ITask>;

    public static fromITask(t: ITask) {
        const {id, name, complete, locations, description, created, updated, children} = t;
        return new Task(id, name, complete, locations, description, created, updated, children);
    }

    constructor(id: number,
                name: string,
                complete: boolean = false,
                locs?: TaskLocation | TaskLocation[],
                description?: string,
                created?: string | Date | number,
                updated?: string | Date | number,
                children?: Array<ITask> | number[]) {
        this.id = id;
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
        if (children && children.length) {
            this.children = children.map(c => {
                if (typeof c !== 'number') {
                    return c.id;
                }
                return c;
            });
        }
    }


    public addChild(t: ITask | number) {
        this._children.push(typeof t === 'number' ? t : t.id);
    }

    public removeChild(id: number): number | null {
        let i = this._children.findIndex(existing => existing === id);
        if (i !== -1)
            return this._children.splice(i, 1)[0];

        i = this._childRefs.findIndex(curr => curr.id === id);
        if (i !== -1)
            return this._childRefs.splice(i, 1)[0]['id'];

        return null;
    }

    get id() {
        return this._id;
    }

    set id(id: number) {
        this._id = id;
    }

    get children() {
        return this._children;
    }

    set children(tasks: number[]) {
        this._children = tasks;
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
        const i = this._locations.findIndex(({
                                                 filePath,
                                                 lineNumber
                                             }) => filePath === loc.filePath && lineNumber === loc.lineNumber);
        if (i !== -1)
            return this._locations.splice(i, 1)[0];
        return null;
    }

    public hasLocation(loc: TaskLocation) {
        const i = this._locations
            .findIndex(({filePath, lineNumber}) => filePath === loc.filePath && lineNumber === loc.lineNumber);
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

    get yamlObject() {
        return taskToYamlObject(this);
    }
}

/*
create task file
get task template

what's the goal? what's the mvp?
- just need to manipulate a backlog and completed file in response to creation, deletion, checking/unchecking of a task
- ensure its consistent and without duplicates
 */