import TaskParser, {parseTaskString} from './TaskParser';
import {createTaskFileContents} from "../TestHelpers";
import {Task} from "../Task";

/**
 * TODO invalid cases and handle reformatting
 *  - more than one x
 *  - missing [ or ]
 *  - other characters within brackets
 */


test('Parse a single incomplete todo item', () => {
    const line = '- [ ] an incomplete todo';
    const t: Task = parseTaskString(line);
    expect(t.complete).toBe(false);
    expect(t.name).toEqual('an incomplete todo');
});

test('Parse a single complete todo item', () => {
    const line = '- [x] a complete todo';
    const t: Task = parseTaskString(line);
    expect(t.complete).toBe(true);
    expect(t.name).toEqual('a complete todo');
});

test('Parse a todo with a nested todo in the text', () => {
    const line = '- [x] a complete todo but here - [ ] is another oddity';
    const t: Task = parseTaskString(line);
    expect(t.complete).toEqual(true);
    expect(t.name).toEqual('a complete todo but here - [ ] is another oddity');
});

test('Parse minimally valid tasks', () => {
    const items = ['- []', '- [x]', '- [ ]', '  - [x]', '    - []']
    for (const [itemI, checkbox] of items.entries()) {
        const names = ['a', '|', '?', '.'];
        for (const [i, name] of names.entries()) {
            const test = `${checkbox} ${name}`;
            const baseTask = parseTaskString(test);
            const expectedStatus = itemI % 2 !== 0;
            expect(baseTask.complete).toEqual(expectedStatus);
            expect(baseTask.name).toEqual(names[i])
        }
    }
});

test('Parser a series of invalid todos', () => {
    const items = [
      ['- [  ]', '- [', '[ ]', '-[]', '-[ ]', '- ]'].map(x => x.concat(' ', 'incomplete task')),
        ['- [ x]', '- [x', '-[x]', '-[x ]', '[x]'].map(x => x.concat(' ', 'complete task')),
        ['- [x]         ', '- [ ] \t', '- [x]\n']
    ];
    for (const bullets of items) {
        for (const bullet of bullets) {
            expect(parseTaskString(bullet)).toBeNull()
        }
    }
})

test('Parser parses file contents successfully', () => {
    const validCount = 11;
   const contents = createTaskFileContents(validCount, 3);
   const items = TaskParser.parseLines(contents);
   expect(items.length).toEqual(11);
   const [done, todo] = items.reduce((pr, [linNo, cur]) => {
      const [d, t] = pr;
      if (cur.complete)
          return [d+1, t];
      else
          return [d, t+1];
   }, [0, 0]);
   expect(done).toEqual(Math.floor(validCount / 2) + 1);
   expect(todo).toEqual(Math.floor(validCount / 2));
});

