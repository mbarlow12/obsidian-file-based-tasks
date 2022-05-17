import { stringifyYaml, TFile } from "obsidian";
import { rrulestr } from "rrule";
import { LineTask } from '../Store/types';
import { hash } from "../util/hash";
import { emptyPosition, taskLocationStr, taskLocFromStr } from "./index";
import { IndexedTask, NonEmptyString, Task, TaskLocation, TaskRecordType, TaskYamlObject } from "./types";

const taskFileNameRegex = /^(?<name>\w.*)(?= - \d+) - (?<id>\d+)(?:.md)?/;

export const emptyLineTask = (): LineTask => {
    return {
        tags: [],
        id: '',
        complete: false,
        name: '',
        parent: -1,
        uid: 0,
        position: emptyPosition(0)
    };
};

export const emptyTask = (): Task => {
    return {
        tags: [],
        id: '',
        complete: false,
        name: '',
        locations: [],
        parentLocations: [],
        description: ''
    };
};
export const emptyIndexedTask = (): IndexedTask => {
    return {
        ...emptyTask(),
        uid: 0,
        childUids: [],
        created: new Date(0),
        parentUids: [],
        updated: new Date(0)
    }
}

export const taskIdToTid = (id: number) => id.toString(16);

export const taskTidToId = (tid: string) => isNaN(Number.parseInt(tid, 16)) ? 0 : Number.parseInt(tid, 16);

export const baseTasksSame = (tA: Task, tB: Task): boolean => {
    return tA.id === tB.id && tA.name == tB.name && tA.complete === tB.complete;
}

export const getTaskFromYaml = (yaml: TaskYamlObject): IndexedTask => {
    const {
        complete, id, locations, name, created, updated, childUids, parentUids, parentLocations, uid, recurrence, tags, dueDate
    } = yaml;
    return {
        uid: Number.parseInt(uid),
        id: id as NonEmptyString,
        name,
        complete: complete === 'true',
        created: new Date(created),
        updated: new Date(updated),
        locations: locations.map(taskLocFromStr),
        parentLocations: parentLocations.map(taskLocFromStr),
        childUids: childUids.map(Number.parseInt),
        parentUids: parentUids.map(Number.parseInt),
        recurrence: rrulestr(recurrence),
        tags,
        dueDate: new Date(dueDate),
        description: ''
    };
}

export const taskToYamlObject = (task: IndexedTask): TaskYamlObject => {
    const {id, uid, name, complete, locations, created, updated, parentLocations, childUids, parentUids, tags, dueDate, recurrence} = task
    return {
        type: TaskRecordType,
        id: id,
        uid: `${uid}`,
        name,
        complete: `${complete}`,
        locations: locations.map(taskLocationStr),
        created: created.toISOString(),
        updated: updated.toISOString(),
        childUids: childUids.map(c => `${c}`),
        parentUids: parentUids.map(c => `${c}`),
        parentLocations: parentLocations.map(taskLocationStr),
        tags,
        dueDate: dueDate.toISOString(),
        recurrence: (recurrence || '').toString()
    };
}

export const taskToBasename = (task: IndexedTask) => `${task.name} - ${task.id}`;
export const taskToFilename = (task: IndexedTask) => `${taskToBasename(task)}.md`;

export const isFilenameValid = (f: TFile): boolean => {
    const match = f.basename.match(taskFileNameRegex);
    if (!match)
        return false

    if (!match.groups.hasOwnProperty('name'))
        return false;

    return match.groups.hasOwnProperty('id');


}

export const parseTaskFilename = (f: TFile) => {
    const match = f.basename.match(taskFileNameRegex);
    const {name, id} = match.groups;
    return {name, id};
};

export const taskToFileContents = (task: IndexedTask): string => {
    const yamlObject = taskToYamlObject(task);
    return `---\n${stringifyYaml(yamlObject)}---\n${task.description || ''}`;
}

export const taskToJsonString = (task: IndexedTask): string => {
    const {
        name, complete, locations, description, created
    } = task;
    const ret: Record<string, string | boolean | TaskLocation[] | string[]> = {
        name, complete, created: `${created}`
    };
    ret.locations = locations.sort((a, b) => {
        const comp = a.filePath.localeCompare(b.filePath);
        if (comp === 0) {
            return a.lineNumber - b.lineNumber;
        }
        return comp;
    });
    if (description)
        ret.description = description.trim();
    return JSON.stringify(ret);
}

export const hashTask = async (task: IndexedTask): Promise<string> => {
    return await hash(taskToJsonString(task));
}

export const taskAsChecklist = (t: Pick<Task, 'id'|'name'|'complete'>) => `- [${t.complete ? 'x' : ' '}] ${t.name} ^${t.id}`;

export const taskFileLine = (t: Task, offset = 0) => new Array(offset).fill(' ').join('') + taskAsChecklist(t);

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
export const compareTaskChildren = (taskA: IndexedTask, taskB: IndexedTask): [number[], number[]] => {
    return compareArrays(taskA.childUids, taskB.childUids);
};

export const compareTaskLocations = (first: IndexedTask, second: IndexedTask): [TaskLocation[], TaskLocation[]] => {
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