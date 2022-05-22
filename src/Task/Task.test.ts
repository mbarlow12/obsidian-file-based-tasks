import { values } from 'lodash';
import { TaskInstanceIndex } from '../Store/types';
import { filePaths, taskIds, taskNames, taskUids } from '../TestHelpers';
import { emptyTaskInstance, getTasksFromInstanceIndex } from './Task';
import { TaskInstance } from './types';


describe( 'task utilities', () => {

    test( 'Create task from good instances', () => {
        const instances = filePaths.slice( 0, 3 ).reduce( (idx, fp) => ({
            ...idx,
            [fp]: {
                [taskUids[0]]: {
                    ...emptyTaskInstance(),
                    filePath: fp,
                    name: taskNames[ 0 ],
                    id: taskIds[ 0 ],
                    uid: taskUids[ 0 ]
                }
            }
        }), {} as TaskInstanceIndex );
        const tasks = values(getTasksFromInstanceIndex( instances ));
        expect(tasks.length).toEqual(1);
        const task = tasks.pop();
        expect( task.name ).toEqual( 'task number 1' );
        expect( task.uid ).toEqual( taskUids[ 0 ] );
        expect( task.id ).toEqual( task.uid.toString( 16 ) );
        expect( task.instances.length ).toEqual( 3 );
    } );

    test( 'Differing task instance ids throw error', () => {
        const instances = filePaths.slice( 0, 3 ).reduce( (idx, fp, i ) => ({
            ...idx,
            [fp]: {
                [taskUids[0]]: {
                    ...emptyTaskInstance(),
                    filePath: fp,
                    name: taskNames[ 0 ],
                    id: i === 0 ? taskIds[ 0 ] : taskIds[ 1 ],
                    uid: taskUids[ 0 ],
                }
            }
        }), {} as TaskInstanceIndex );
        expect( () => getTasksFromInstanceIndex( instances ) )
            .toThrow( 'Tasks with same name must all have the same id and uid (possibly zero).' )
    } );

    test( 'Differing task instance uids throw error', () => {
        const instances = filePaths.slice( 0, 3 ).reduce( (idx, fp, i ) => ({
            ...idx,
            [fp]: {
                [i === 0 ? taskUids[ 0 ] : taskUids[ 1 ]]: {
                    ...emptyTaskInstance(),
                    filePath: fp,
                    name: taskNames[ 0 ],
                    id: taskIds[ 0 ],
                    uid: i === 0 ? taskUids[ 0 ] : taskUids[ 1 ],
                } as TaskInstance,
            } as Record<any, any>
        }), {} as TaskInstanceIndex );
        expect( () => getTasksFromInstanceIndex( instances ) )
            .toThrow( 'Tasks with same name must all have the same id and uid (possibly zero).' )
    } );

    test( 'Several instances several tasks', () => {
        const instances = filePaths.reduce( (idx, fp, i) => ({
            ...idx,
            [fp]: {
                [taskUids[i]]: {
                    ...emptyTaskInstance(),
                    filePath: fp,
                    name: taskNames[ i ],
                    id: taskIds[ i ],
                    uid: taskUids[ i ]
                }
            }
        }), {} as TaskInstanceIndex );
        const tasks = values(getTasksFromInstanceIndex( instances ));
        expect(tasks).toHaveLength(10)
        for (const task of tasks) {
            expect(task.instances).toHaveLength(1);
            expect(task.instances[0].id).toEqual(task.uid.toString(16));
        }
    } );
} )