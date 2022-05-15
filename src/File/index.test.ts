import {CachedMetadata} from "obsidian";
import {getFileTaskRecord, hashTaskCache} from "./index";
import {FileTaskCache} from "./types";
import * as TestData from './TestData';
import {getFileContents, testTaskLines} from './TestData';

const testContents1 = `- [ ] t1
- [ ] t2
\t- [ ] t3
\t- [ ] t4
`;

const testContents2 = `- [ ] t1 ^12345
\t- [x] t2 ^23456`;

const cacheMetadata1: CachedMetadata = {
    listItems: [
        {
            task: ' ',
            parent: -1,
            position: {
                start: {line: 0, col: 0, offset: 0},
                end: {line: 0, col: 8, offset: 8},
            }
        },
        {
            task: ' ',
            parent: -1,
            position: {
                start: {line: 1, col: 0, offset: 9},
                end: {line: 1, col: 8, offset: 17},
            }
        },
        {
            task: ' ',
            parent: 1,
            position: {
                end: {line: 2, col: 9, offset: 27},
                start: {line: 2, col: 1, offset: 19},
            }
        },
        {
            task: ' ',
            parent: 1,
            position: {
                end: {line: 3, col: 9, offset: 37},
                start: {line: 3, col: 1, offset: 29},
            }
        }
    ]
}

const cacheMetadata2: CachedMetadata = {
    listItems: [
        {
            id: "12345",
            task: ' ',
            parent: -1,
            position: {
                end: {line: 0, col: 15, offset: 15},
                start: {line: 0, col: 0, offset: 0},
            }
        },
        {
            id: "23456",
            task: 'x',
            parent: 0,
            position: {
                end: {line: 1, col: 16, offset: 32},
                start: {line: 1, col: 1, offset: 17},
            }
        },
    ]
}

test('Basic representation', () => {
    const obj = getFileTaskRecord(cacheMetadata1, testContents1);
    const expected: FileTaskCache = {
        0: {
            id: -1,
            name: 't1',
            complete: false,
            parent: -1,
            lineNumber: 0,
        },
        1: {
            id: -1,
            name: 't2',
            complete: false,
            parent: -1,
            lineNumber: 1,
        },
        2: {
            id: -1,
            name: 't3',
            complete: false,
            parent: 1,
            parentId: -1,
            parentName: 't2',
            lineNumber: 2,
        },
        3: {
            id: -1,
            name: 't4',
            complete: false,
            parent: 1,
            parentId: -1,
            parentName: 't2',
            lineNumber: 3,
        }
    }
    expect(obj).toEqual(expected);
});

test('Representation with ids', () => {
    const obj = getFileTaskRecord(cacheMetadata2, testContents2);
    const expected: FileTaskCache = {
        0: {
            id: 12345,
            name: 't1',
            complete: false,
            parent: -1,
            lineNumber: 0,
        },
        1: {
            id: 23456,
            name: 't2',
            complete: true,
            parent: 0,
            parentName: 't1',
            parentId: 12345,
            lineNumber: 1,
        },
    };
    expect(obj).toEqual(expected);
});

test('Test Diff', async () => {
    const {contents1, cache1, contents2, cache2} = TestData;
    const tCache1 = getFileTaskRecord(cache1, contents1);
    const tCache2 = getFileTaskRecord(cache2, contents2);
    const h1 = await hashTaskCache(tCache1);
    const h12 = await hashTaskCache(tCache1);
    expect(h1).toEqual(h12);
    const h2 = await hashTaskCache(tCache2);
    expect(h1).not.toEqual(h2);
});

test('Test filecontents', async () => {
    const c1 = getFileContents(testTaskLines.slice(0, 6), {0: [1], 1: [2, 3], 3: [4]});
    const c2 = getFileContents(testTaskLines.slice(0, 6), {0: [1], 1: [2, 3], 3: [4]});
    const fc1 = getFileTaskRecord(c1.cache, c1.contents);
    const fc2 = getFileTaskRecord(c2.cache, c2.contents);
    const h1 = await hashTaskCache(fc1);
    const h2 = await hashTaskCache(fc2);
    expect(h1).toEqual(h2);
});