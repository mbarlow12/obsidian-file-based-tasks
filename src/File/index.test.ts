import {CachedMetadata} from "obsidian";
import {getFileTaskCache, getHierarchyDiff} from "./index";
import {FileTaskCache} from "./types";
import {TaskStatus} from "../Task";
import * as TestData from './TestData';
import {base, getFileContents, testTaskLines} from "./TestData";

const testContents1 = `
- [ ] t1
- [ ] t2
    - [ ] t3
    - [ ] t4
`

const cacheMetadata1: CachedMetadata = {
    listItems: [
        {
            task: ' ',
            parent: -1,
            position: {
                start: { line: 1, col: 0, offset: 3},
                end: { line: 1, col: 8, offset: 3}
            }
        },
        {
            task: ' ',
            parent: -1,
            position: {
                start: { line: 2, col: 0, offset: 3},
                end: { line: 2, col: 8, offset: 3}
            }
        },
        {
            task: ' ',
            parent: 2,
            position: {
                start: { line: 3, col: 3, offset: 3},
                end: { line: 3, col: 11, offset: 3}
            }
        },
        {
            task: ' ',
            parent: 2,
            position: {
                start: { line: 4, col: 3, offset: 3},
                end: { line: 4, col: 11, offset: 3}
            }
        }
    ]
}

test('Basic representation', () => {
    const obj = getFileTaskCache(cacheMetadata1, testContents1);
    const expected: FileTaskCache = {
        "locations": {
            1: "t1",
            2: "t2",
            3: "t3",
            4: "t4"
        },
        "hierarchy": {
            "t1": {
                "status": TaskStatus.TODO,
                "name": "t1"
            },
            "t2": {
                "status": TaskStatus.TODO,
                "name": "t2",
                "children": ['t3', 't4']
            },
            "t3": {
                "status": TaskStatus.TODO,
                "name": "t3"
            },
            "t4": {
                "status": TaskStatus.TODO,
                "name": "t4"
            }
        }
    };
    expect(obj).toEqual(expected);
});

test('Test Diff', () => {
   const {contents1, cache1, contents2, cache2} = TestData;
   const tCache1 = getFileTaskCache(cache1, contents1);
   const tCache2 = getFileTaskCache(cache2, contents2);
   const diff = getHierarchyDiff(tCache1.hierarchy, tCache2.hierarchy);
   // console.log(diff);
});

test('Test filecontents', () => {
    const {contents, cache} = getFileContents(testTaskLines.slice(0, 6), {0: [1], 1: [2, 3], 3: [4]});
    console.log(contents);
    const {locations, hierarchy} = getFileTaskCache(cache, contents);
    for (const key in hierarchy) {
        console.log(hierarchy[key])
    }
})