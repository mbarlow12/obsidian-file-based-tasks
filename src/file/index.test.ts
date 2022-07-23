import { CachedMetadata, TFile } from "obsidian";
import { ITaskInstance } from '../store/orm';
import { LOC_DELIM } from '../Task';

const testContents1 = `- [ ] t1
- [ ] t2
    - [ ] t3
    - [ ] t4
`;

const testContents2 = `- [ ] t1 ^12345
    - [x] t2 ^23456`;

const cacheMetadata1: CachedMetadata = {
    listItems: [
        {
            task: ' ',
            parent: -1,
            position: {
                start: { line: 0, col: 0, offset: 0 },
                end: { line: 0, col: 8, offset: 8 },
            }
        },
        {
            task: ' ',
            parent: -1,
            position: {
                start: { line: 1, col: 0, offset: 9 },
                end: { line: 1, col: 8, offset: 17 },
            }
        },
        {
            task: ' ',
            parent: 1,
            position: {
                end: { line: 2, col: 9, offset: 27 },
                start: { line: 2, col: 1, offset: 19 },
            }
        },
        {
            task: ' ',
            parent: 1,
            position: {
                end: { line: 3, col: 9, offset: 37 },
                start: { line: 3, col: 1, offset: 29 },
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
                end: { line: 0, col: 15, offset: 15 },
                start: { line: 0, col: 0, offset: 0 },
            }
        },
        {
            id: "23456",
            task: 'x',
            parent: 0,
            position: {
                end: { line: 1, col: 16, offset: 32 },
                start: { line: 1, col: 1, offset: 17 },
            }
        },
    ]
}

// jest.mock('obsidian')

test( 'Basic representation', () => {
    const file = new TFile();
    file.path = 'file/path'
    // const obj = getFileInstanceIndex( file, cacheMetadata1, testContents1 );
    const expected: Map<string, ITaskInstance> = new Map( [
        [
            `file/path${LOC_DELIM}0`, {
            id: 0,
            name: 't1',
            complete: false,
            line: 0,
            parent: -1,
            rawText: '- [ ] t1',
            filePath: 'file/path',
            parentLine: -1,
            childLines: [],
            links: [],
            tags: []
        }
        ],
        [
            `file/path${LOC_DELIM}1`, {
            id: 0,
            name: 't2',
            complete: false,
            line: 1,
            parentLine: -1,
            rawText: '- [ ] t2',
            filePath: 'file/path',
            childLines: [2, 3],
            links: [],
            tags: []
        }
        ],
        [
            `file/path${LOC_DELIM}2`, {
            id: 0,
            name: 't3',
            complete: false,
            line: 2,
            parentLine: 1,
            rawText: '    - [ ] t3',
            filePath: 'file/path',
            childLines: [],
            links: [],
            tags: []
        }
        ],
        [
            `file/path${LOC_DELIM}3`, {
            id: 0,
            name: 't4',
            complete: false,
            parentLine: 1,
            line: 3,
            filePath: 'file/path',
            rawText: '    - [ ] t4',
            childLines: [],
            links: [],
            tags: []
        }
        ]
    ] )
    // expect( obj ).toEqual( expected );
} );

test( 'Representation with ids', () => {
    // const file = new TFile();
    // file.path = 'file/path'
    // const obj = getFileInstanceIndex( file, cacheMetadata2, testContents2 );
    // const expected: Map<string, ITaskInstance> = new Map( [
    //     [
    //         `file/path${LOC_DELIM}0`, {
    //         id: 12345,
    //         name: 't1',
    //         complete: false,
    //         parentLine: -1,
    //         filePath: 'file/path',
    //         rawText: '- [ ] t1 ^12345',
    //         childLines: [1],
    //         links: [],
    //         tags: [],
    //         line: 0,
    //     }
    //     ],
    //     [
    //         `file/path${LOC_DELIM}1`, {
    //         id: 23456,
    //         line: 1,
    //         name: 't2',
    //         complete: true,
    //         parentLine: 0,
    //         filePath: 'file/path',
    //         rawText: '    - [x] t2 ^23456',
    //         links: [],
    //         tags: [],
    //         childLines: []
    //     }
    //     ]
    // ] );
    // expect( obj ).toEqual( expected );
} );

test( 'Test filecontents', async () => {
    // const f1 = new TFile();
    // f1.path = 'test/path1';
    // const f2 = new TFile();
    // f2.path = 'test/path1';
    // const c1 = getFileContents( testTaskLines.slice( 0, 6 ), { 0: [ 1 ], 1: [ 2, 3 ], 3: [ 4 ] } );
    // const c2 = getFileContents( testTaskLines.slice( 0, 6 ), { 0: [ 1 ], 1: [ 2, 3 ], 3: [ 4 ] } );
    // const fc1 = getFileInstanceIndex( f1, c1.cache, c1.contents );
    // const fc2 = getFileInstanceIndex( f2, c2.cache, c2.contents );
    // expect( fc1 ).toStrictEqual( fc2 );
} );