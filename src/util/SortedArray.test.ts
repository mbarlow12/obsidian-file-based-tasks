import { emptyPosition, TaskInstance } from '../Task';
import { createTestTaskInstance } from '../TestHelpers';
import { Comparator, SortedArray } from './SortedArray';

const testNumComparator: Comparator<number> = ( a, b ) => a - b;

describe( 'Numeric array tests', () => {

    test( 'Sorted array constructor', () => {
        let test = new SortedArray( [ 4, 2, 6, 3, 5, 1, 7 ], testNumComparator );
        expect( [ ...test ] ).toEqual( [ 1, 2, 3, 4, 5, 6, 7 ] );

        test = new SortedArray( [ 1, 2, 3, 4, 5 ], ( a, b ) => a - b );
        expect( [ ...test ] ).toEqual( [ 1, 2, 3, 4, 5 ] );

        test = new SortedArray( [], ( a, b ) => a - b );
        expect( [ ...test ] ).toEqual( [] );

        test = new SortedArray( [ 5, 5, 5 ], ( a, b ) => a - b );
        expect( [ ...test ] ).toEqual( [ 5, 5, 5 ] );
    } );

    test( 'Test find insert index', () => {
        let test = new SortedArray( [ 4, 8, 7, 2, 0, 19 ], testNumComparator );
        expect( test.findInsertIndex( 2 ) ).toEqual( 1 );
        expect( test.findInsertIndex( 3 ) ).toEqual( ~2 );
        expect( test.findInsertIndex( 25 ) ).toEqual( ~6 );

        test = new SortedArray( [], testNumComparator )
        expect( test.findInsertIndex( 9 ) ).toEqual( ~0 );
    } );
} );

const instanceComparator: Comparator<TaskInstance> = (a, b) => {
    if (a.filePath > b.filePath)
        return 1;
    else if (a.filePath < b.filePath)
        return -1;
    else {
        return a.position.start.line - b.position.start.line;
    }
}

describe( 'TaskInstance array tests', () => {

    test( 'Test constructor' , () => {
        const testTaskInstances = [5,3,1,9,2,0,0,0].map((i, idx) => createTestTaskInstance(i, emptyPosition(i % 4), -1, `${idx % 4}file.md`))
        const test = new SortedArray(testTaskInstances, instanceComparator);
        // filepaths: #file, 0, 1, 2, 3, 0, 1, 2, 3]
        // pos:              1, 3, 1, 1, 2, 0, 0, 0]
        // order:            0, 3  5  7  1  2  4  6
        expect(test.map(i => i.uid)).toEqual([5, 2, 0, 3, 0, 1, 0, 9])
        expect(test.map(i => i.position.start.line)).toEqual([1, 2, 0, 3, 0, 1, 0, 1])
    });

    test( 'insert with replacement', () => {
        const testTaskInstances = [1,2,3,4,5].map((n, i) => createTestTaskInstance(n, emptyPosition(i % 2), -1, `file${i%3}.md`));
        // files: file0, file1, file2, file0, file1
        // positions  0,     1,     0,     1,     0
        // order      1      4      5      2      3
        const test = new SortedArray(testTaskInstances, instanceComparator);
        const toInsert = [9,8,10].map((n, i) => createTestTaskInstance(n, emptyPosition(i % 3), -1, `file${n - 8}.md`))
        // files: file1, file0, file2
        // pos:       0,     1,     2
        // order      2      1      3
        // match?     y      Y      N
        test.insert(toInsert, true);
        expect(test).toHaveLength(6);
        expect(test.map(i => i.uid)).toEqual([1,8, 9, 2, 3, 10]);
    });

    test( 'insert without replacement', () => {
        const testTaskInstances = [1,2,3,4,5].map((n, i) => createTestTaskInstance(n, emptyPosition(i % 2), -1, `file${i%3}.md`));
        // files: file0, file1, file2, file0, file1
        // positions  0,     1,     0,     1,     0
        // order      1      4      5      2      3
        const test = new SortedArray(testTaskInstances, instanceComparator);
        const toInsert = [9,8,10].map((n, i) => createTestTaskInstance(n, emptyPosition(i % 3), -1, `file${n - 8}.md`))
        // files: file1, file0, file2
        // pos:       0,     1,     2
        // order      2      1      3
        // match?     y      Y      N
        test.insert(toInsert);
        expect(test).toHaveLength(8);
        expect(test.map(i => i.uid)).toEqual([1, 8, 4, 9, 5, 2, 3, 10]);
    });
});