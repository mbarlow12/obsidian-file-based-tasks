import {Loc, Pos} from "obsidian";
import {TaskLocation} from "./types";

export * from './Task'
export * from "./types"

const locationDelim = ':';

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

export const locStr = ({line, col, offset}: Loc): string => [line, col, offset].join(locationDelim);

export const posStr = ({start, end}: Pos): string => [locStr(start), locStr(end)].join(locationDelim);

export const taskLocationStr = ({filePath, lineNumber}: TaskLocation): string => [filePath, `${lineNumber}`].join(locationDelim);

export const taskLocFromStr = (locationStr: string): TaskLocation => {
    const [filePath, lineNumber] = locationStr.split(locationDelim);
    return {filePath, lineNumber: Number.parseInt(lineNumber)};
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
