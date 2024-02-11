import { Pos } from 'obsidian';
import { ITaskInstance } from '../src/store/orm';
import { pos } from '../src/util';

export const getDate = () => {
    const d = new Date();
    return () => new Date( d );
}

export const testInstance = (
    testId: number,
    id = 0,
    filePath = '',
    line = 0,
    complete = false,
): ITaskInstance => ({
    id,
    name: id === 0 ? `new test instance ${testId}` : `test instance ${id}`,
    complete,
    filePath: filePath.length > 0 ? filePath : `path/to/file ${testId}.md`,
    line,
    parentLine: -1,
    childLines: [],
    tags: [],
    links: [],
    rawText: ''
});
export const createTestTaskLine = (
    id: number,
    complete = false
) => `- [${complete ? 'x' : ' '}] test task with id ${id} ^${id.toString( 16 )}`;
/**
 * TODO invalid cases and handle reformatting
 *  - more than one x
 *  - missing [ or ]
 *  - other characters within brackets
 */


export const emptyPosition = ( line: number ): Pos => pos( line, 0, 0, 0, 0, 0 );
export const dateStr = ( arg: number | string ) => (new Date( arg )).toDateString();