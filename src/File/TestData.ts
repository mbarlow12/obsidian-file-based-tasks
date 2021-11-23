import {CachedMetadata, ListItemCache} from "obsidian";
import {assign, entries} from "lodash";

export const testTaskLines = Array(10).fill('').map((v, i) => `- [ ] t${i}`);

const baseListItem: ListItemCache = {
    "position": {
        "start": {
            "line": 0,
            "col": 0,
            "offset": 0
        },
        "end": {
            "line": 0,
            "col": 8,
            "offset": 8
        }
    },
    "parent": -1,
    "task": " "
};
const getListItem = (x: any): ListItemCache => {
    return baseListItem;
}

export const getFileContents = (taskLines: string[], relationships: Record<number, number[]>) => {
    const listItems: ListItemCache[] = [];
    for (let i = 0; i < taskLines.length; i++) {
        listItems.push(assign({}, baseListItem, {
            position: {
                ...baseListItem.position,
                start: { line: i, col: 0, offset: 0 }}}));
    }
    const children: number[] = []
    for (let i = 0; i < taskLines.length; i++) {
        if (i in relationships) {
            let childIdxs = relationships[i].map(cidx => [i, cidx]);
            while (childIdxs.length > 0) {
                let [parentI, childIdx] = childIdxs.pop();
                taskLines[childIdx] = `  ${taskLines[childIdx]}`
                listItems[childIdx].parent = parentI;
                if (childIdx in relationships) {
                    childIdxs.push(...relationships[childIdx].map(ci => [childIdx, ci]));
                }
                children.push(childIdx);
            }
        }
    }

    return {
        contents: taskLines.join('\n'),
        cache: {
            listItems
        } as CachedMetadata,
    }
};

export const base: string = testTaskLines.slice(0, 5).join('\n')
export const baseReversed: string = testTaskLines.slice(0, 5).reverse().join('\n');


export const contents1: string =
    `- [ ] t1
- [ ] t2`;

export const cache1: CachedMetadata = {
    "listItems": [
        {
            "position": {
                "start": {
                    "line": 0,
                    "col": 0,
                    "offset": 0
                },
                "end": {
                    "line": 0,
                    "col": 8,
                    "offset": 8
                }
            },
            "parent": -1,
            "task": " "
        },
        {
            "position": {
                "start": {
                    "line": 1,
                    "col": 0,
                    "offset": 9
                },
                "end": {
                    "line": 1,
                    "col": 8,
                    "offset": 17
                }
            },
            "parent": -1,
            "task": " "
        }
    ]
};

export const contents2: string =
    `- [ ] t1
\t- [ ] t2`;

export const cache2: CachedMetadata = {
    "listItems": [
        {
            "position": {
                "start": {
                    "line": 0,
                    "col": 0,
                    "offset": 0
                },
                "end": {
                    "line": 0,
                    "col": 8,
                    "offset": 8
                }
            },
            "parent": -1,
            "task": " "
        },
        {
            "position": {
                "start": {
                    "line": 1,
                    "col": 1,
                    "offset": 10
                },
                "end": {
                    "line": 1,
                    "col": 9,
                    "offset": 18
                }
            },
            "parent": 0,
            "task": " "
        }
    ]
};

export const contents3: string = `- [ ] t4
\t- [ ] t2`;

export const cache3: CachedMetadata = {
    "listItems": [
        {
            "position": {
                "start": {
                    "line": 0,
                    "col": 0,
                    "offset": 0
                },
                "end": {
                    "line": 0,
                    "col": 8,
                    "offset": 8
                }
            },
            "parent": -1,
            "task": " "
        },
        {
            "position": {
                "start": {
                    "line": 1,
                    "col": 1,
                    "offset": 10
                },
                "end": {
                    "line": 1,
                    "col": 9,
                    "offset": 18
                }
            },
            "parent": 0,
            "task": " "
        }
    ]
};

const contents4: string = `- [ ] t2
\t- [ ] t4`;
const contents5: string = `- [ ] t1
- [ ] t2`;
