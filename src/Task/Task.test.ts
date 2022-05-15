import {IndexedTask} from "./types";
import {hashTask} from "./Task";
import {hash} from "../util/hash";

test('Task stringifies properly', () => {
    const child: IndexedTask = {
        id: 23456,
        name: "child task",
        complete: true,
        created: Date.now(),
        updated: Date.now(),
        locations: [{
            filePath: 'main/a good file.md',
            lineNumber: 5
        }],
        childTids: [],
    }

    const task: IndexedTask = {
        id: 12345,
        name: "Test task 1",
        complete: true,
        locations: [{
            filePath: 'main/a good file.md',
            lineNumber: 4
        }, {
            filePath: 'inbox/an unworked file.md',
            lineNumber: 0
        }],
        childTids: [child.id],
        created: Date.now(),
        updated: Date.now(),
        description: 'this is a long description of this task',
    }
    const expected = hash(JSON.stringify({
        id: 12345,
        name: task.name,
        complete: true,
        locations: task.locations,
        children: [child.id],
        description: task.description
    }));
    expect(hashTask(task)).toEqual(expected);
});