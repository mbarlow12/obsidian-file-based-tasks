import { Task } from '../Task';
import { emptyTask } from '../Task/Task';
import { createTask } from './TaskStore';
import { TaskStoreState } from './types';

test('Test create task', () => {
    const state: TaskStoreState = { index: {}, instanceIndex: {} }
    const task: Task = {
        ...emptyTask(),
        name: 'default task',
    };
    const newState = createTask(task, 1, state)
    expect(newState).toStrictEqual({
        index: {
            1: {
                id: '1',
                uid: 1,
                name: 'default task',
                parentUids: [],
                childUids: [],
                created: new Date(0),
                updated: new Date(0),
                complete: false,
                description: ''
            }
        },
        instanceIndex: {}
    } as TaskStoreState)
});

// test delete
// test modify single task
// test rename file
// test delete file
// test modify file tasks

describe( 'file modify tasks', () => {} )

describe( 'test store reducer', () => {} )
