import {Loc, Pos} from "obsidian";
import {MinTaskLocation, TaskLocation} from "./types";

export {
    emptyTask,
    getTaskFromYaml,
    taskToFileContents,
    taskToJsonString,
    taskAsChecklist,
    taskToYamlObject,
    taskFileLine,
    taskToBasename,
    taskToFilename,
    compareTaskChildren,
    compareTaskLocations,
    baseTasksSame,
    hashTask,
    parseTaskFilename,
    compareArrays,
} from './Task'
export * from "./types"

export const LOC_DELIM = '::';

export const loc = (line: number, col: number, offset: number): Loc => ({line, col, offset});

export const pos = (...locData: number[]): Pos => {
    if (locData.length != 6) {
        throw new Error("Must provide line, col, offset for both start and end (6 total args).")
    }
    const [sline, scol, soff] = locData.slice(0, 3);
    const [eline, ecol, eoff] = locData.slice(3);
    return {
        start: loc(sline, scol, soff),
        end: loc(eline, ecol, eoff),
    };
}

export const locStr = ({line, col, offset}: Loc): string => [line, col, offset].join(LOC_DELIM);

export const posStr = ({start, end}: Pos): string => [locStr(start), locStr(end)].join(LOC_DELIM);

export const taskLocationStr = ({filePath, lineNumber, pos}: TaskLocation): string => [filePath, `${lineNumber}`, posStr(pos)].join(LOC_DELIM);

export const taskLocLineStr = ({filePath, lineNumber}: MinTaskLocation): string => [filePath, `${lineNumber}`].join(LOC_DELIM);

export const emptyPosition = (line: number): Pos => pos(line, 0, 0, 0, 0, 0);

export const taskLocFromStr = (locationStr: string): TaskLocation => {
    const [filePath, lineNumber, parent, ...position] = locationStr.split(LOC_DELIM);
    return {
        filePath,
        lineNumber: Number.parseInt(lineNumber),
        parent: Number.parseInt(parent),
        pos: pos(...position.map(Number.parseInt))
    };
}

export const taskLocFromMinStr = (locStr: string): MinTaskLocation => {
    const [filePath, lineNumber] = locStr.split(LOC_DELIM);
    return {filePath, lineNumber: Number.parseInt(lineNumber)}
}

export const locationsEqual = (locA: TaskLocation, locB: TaskLocation) => {
  return locA.filePath === locB.filePath && locA.lineNumber === locB.lineNumber;
};

export const positionsEqual = (p1: Pos, p2: Pos) => {
    return locsEqual(p1.start, p2.start);
}

export const locsEqual = (l1: Loc, l2: Loc) => {
    return l1.line === l2.line && l1.col === l2.col && l1.offset === l2.offset;
}
