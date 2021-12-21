// import {stringifyYaml} from "obsidian";
import {DisplayTask, ITask, ITaskTree, TaskLocation, TaskYamlObject, Yamlable} from "./types";
import {TaskIndex} from "../TaskIndex";
import {stringifyYaml} from "obsidian";
import {TaskTree} from "../File/types";

export const emptyTask: ITask = {
    id: -1,
    complete: false,
    name: '',
    locations: [],
    created: 0,
    updated: 0,
    children: [],
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
        locations: locations.map(loc => {
            const [filePath, line, name] = loc.split(':');
            return {filePath, line: Number.parseInt(line)}
        }),
        children: children.map(c => Number.parseInt(c))
    };
}

export const taskToYamlObject = (task: ITask): TaskYamlObject => {
    const {id, name, complete, locations, created, updated, children} = task
    return {
        id: `${id}`,
        name,
        complete: `${complete}`,
        locations: locations.map(l => `${l.filePath}:${l.line}`),
        created: (new Date(created)).toLocaleString(),
        updated: (new Date(updated)).toLocaleString(),
        children: (children || []).map(c => `${c}`)
    };
}

export const taskToFileContents = (task: ITask): string => {
    const yamlObject = taskToYamlObject(task);
    let ret = stringifyYaml(yamlObject);
    ret += '\n';
    ret += task.description;
    return ret;
}

export const taskToJsonString = (task: ITask): string => {
    const {
        name, complete, locations, children, description, created, updated
    } = task;
    const ret: Record<string, string | boolean | TaskLocation[] | string[]> = {
        name, complete, locations, created: `${created}`, updated: `${updated}`
    };
    if (children)
        ret.children = children.map(c => `${c}`);
    if (description)
        ret.description = description.trim();
    return JSON.stringify(ret);
}

export const hashTask = async (task: ITask): Promise<string> => {
    const encoded = new TextEncoder().encode(taskToJsonString(task));
    const buffer = await crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(buffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}


export const taskAsChecklist = (task: ITaskTree, colWidth: number = 4): string[] => {
    const x = task.complete ? 'x' : ' ';
    let contents = [`- [${x}] ${task.name}`];
    for (const child of task.children) {
        const childChecklistLines = taskAsChecklist(child, colWidth)
            .map(line => Array(colWidth).fill(' ').join('') + line);
        contents.push(...childChecklistLines);
    }
    return contents;
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

const compareArrays = <T>(first: T[], second: T[]): [T[], T[]] => {
  const firstItems = new Set<T>(first);
  const secondItems = new Set<T>();
  for (const si of second) {
      if (!firstItems.has(si)) {
          secondItems.add(si);
      }
      else {
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

    constructor(id: number,
                name: string,
                complete: boolean = false,
                locs?: TaskLocation | TaskLocation[],
                description?: string,
                created?: string | Date | number,
                updated?: string | Date | number,
                children?: Array<ITask>|number[]) {
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


    public addChild(t: ITask|number) {
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