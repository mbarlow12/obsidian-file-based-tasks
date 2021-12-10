import {ITask} from "./types";
import {Task} from "./Task";

test('Task stringifies properly', () => {
    const child: ITask = {
        name: "child task",
        complete: true,
        created: Date.now(),
        updated: Date.now(),
        locations: [{filePath: 'main/a good file.md', line: 5}],
        children: [],
    }

   const task: ITask = {
       name: "Test task 1",
       complete: true,
       locations: [{filePath: 'main/a good file.md', line: 4}, {filePath: 'inbox/an unworked file.md', line: 35}],
       children: [child.name],
       childRefs: [child],
       created: Date.now(),
       updated: Date.now(),
       description: 'this is a long description of this task',
   }
   const expected = JSON.stringify({
       name: task.name,
       complete: true,
       locations: task.locations,
       children: [child.name],
       description: task.description
   });
    expect(Task.hash(task)).toEqual(expected);
});