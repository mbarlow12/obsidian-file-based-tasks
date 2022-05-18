import { CachedMetadata, TFile } from "obsidian";
import { InstanceIndex } from '../Store/types';
import { getFileTaskState } from "./index";
import { getFileContents, testTaskLines } from './TestData';

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
    const obj = getFileTaskState( file, cacheMetadata1, testContents1 );
    const expected: InstanceIndex = {
        'file/path': [ {
            id: '',
            uid: 0,
            name: 't1',
            complete: false,
            parent: -1,
            position: {
                start: { line: 0, col: 0, offset: 0 },
                end: { line: 0, col: 8, offset: 8 },
            },
            rawText: '- [ ] t1',
            filePath: 'file/path'
        }, {
            id: '',
            uid: 0,
            name: 't2',
            complete: false,
            parent: -1,
            position: {
                start: { line: 1, col: 0, offset: 9 },
                end: { line: 1, col: 8, offset: 17 },
            },
            rawText: '- [ ] t2',
            filePath: 'file/path',
        }, {
            id: '',
            uid: 0,
            name: 't3',
            complete: false,
            parent: 1,
            position: {
                end: { line: 2, col: 9, offset: 27 },
                start: { line: 2, col: 1, offset: 19 },
            },
            rawText: '    - [ ] t3',
            filePath: 'file/path'
        }, {
            id: '',
            uid: 0,
            name: 't4',
            complete: false,
            parent: 1,
            position: {
                end: { line: 3, col: 9, offset: 37 },
                start: { line: 3, col: 1, offset: 29 },
            },
            filePath: 'file/path',
            rawText: '    - [ ] t4',
        } ]
    }
    expect( obj ).toEqual( expected );
} );

test( 'Representation with ids', () => {
    const file = new TFile();
    file.path = 'file/path'
    const obj = getFileTaskState( file, cacheMetadata2, testContents2 );
    const expected: InstanceIndex = {
        'file/path': [ {
            id: '12345',
            uid: Number.parseInt('12345', 16),
            name: 't1',
            complete: false,
            parent: -1,
            position: {
                end: { line: 0, col: 15, offset: 15 },
                start: { line: 0, col: 0, offset: 0 },
            },
            filePath: 'file/path',
            rawText: '- [ ] t1 ^12345',
        }, {
            id: '23456',
            uid: Number.parseInt('23456', 16),
            name: 't2',
            complete: true,
            parent: 0,
            position: {
                end: { line: 1, col: 16, offset: 32 },
                start: { line: 1, col: 1, offset: 17 },
            },
            filePath: 'file/path',
            rawText: '    - [x] t2 ^23456'
        } ]
    };
    expect( obj ).toEqual( expected );
} );

test( 'Test filecontents', async () => {
    const f1 = new TFile();
    f1.path = 'test/path1';
    const f2 = new TFile();
    f2.path = 'test/path2';
    const c1 = getFileContents( testTaskLines.slice( 0, 6 ), { 0: [ 1 ], 1: [ 2, 3 ], 3: [ 4 ] } );
    const c2 = getFileContents( testTaskLines.slice( 0, 6 ), { 0: [ 1 ], 1: [ 2, 3 ], 3: [ 4 ] } );
    const fc1 = getFileTaskState( f1, c1.cache, c1.contents );
    const fc2 = getFileTaskState( f2, c2.cache, c2.contents );
    console.log( fc1 );
    console.log( fc2 );
} );