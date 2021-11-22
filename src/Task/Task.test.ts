import {ITask, TaskStatus} from "./types";
import {Task} from "./Task";

test('Task stringifies properly', () => {
    const child: ITask = {
        name: "child task",
        status: TaskStatus.DONE,
        created: new Date(),
        updated: new Date(),
        locations: [{filePath: 'main/a good file.md', line: 5}]
    }

   const task: ITask = {
       name: "Test task 1",
       status: TaskStatus.TODO,
       locations: [{filePath: 'main/a good file.md', line: 4}, {filePath: 'inbox/an unworked file.md', line: 35}],
       children: [child],
       created: new Date(),
       updated: new Date(),
       description: 'this is a long description of this task',
   }
   const expected = JSON.stringify({
       name: task.name,
       status: task.status,
       locations: task.locations,
       children: [child.name],
       description: task.description
   });
    expect(Task.hash(task)).toEqual(expected);
});