import { taskIndexFromInstances } from '../Store';
import { TaskInstanceIndex } from '../Store/types';
import { filePaths, taskIds, taskNames, taskUids } from '../TestHelpers';
import { instanceIndexKey, LOC_DELIM } from './index';
import { emptyTaskInstance } from './Task';
import { TaskInstance } from './types';


describe( 'task utilities', () => {

    test( 'Create task from good instances', () => {
        const instances: TaskInstanceIndex = filePaths.slice( 0, 3 )
            .reduce( ( idx, fp ) =>
                idx.set(  `${fp}${LOC_DELIM}0`, {
                    ...emptyTaskInstance(),
                    filePath: fp,
                    name: taskNames[ 0 ],
                    id: taskIds[ 0 ],
                    uid: taskUids[ 0 ]
                } ), new Map() as TaskInstanceIndex );
        const tasks = taskIndexFromInstances( instances );
        expect( tasks.size ).toEqual( 1 );
        const task = tasks.get( taskUids[ 0 ] );
        expect( task.name ).toEqual( 'task number 1' );
        expect( task.uid ).toEqual( taskUids[ 0 ] );
        expect( task.id ).toEqual( (task.uid as number).toString( 16 ) );
        expect( task.locations.length ).toEqual( 3 );
    } );

    test( 'Differing task instance ids throw error', () => {
        const instances = filePaths.slice( 0, 3 ).reduce( ( idx, fp, i ) =>
            idx.set( instanceIndexKey( fp, 0 ), {
                ...emptyTaskInstance(),
                filePath: fp,
                name: taskNames[ 0 ],
                id: i === 0 ? taskIds[ 0 ] : taskIds[ 1 ],
                uid: taskUids[ 0 ],
            } ), new Map() as TaskInstanceIndex );
        expect( () => taskIndexFromInstances( instances ) )
            .toThrow( 'Task uids and ids must match.' )
    } );

    test( 'Differing task instance uids throw error', () => {
        const instances = filePaths.slice( 0, 3 ).reduce( ( idx, fp, i ) =>
            idx.set( instanceIndexKey( fp, 0 ), {
                ...emptyTaskInstance(),
                filePath: fp,
                name: taskNames[ 0 ],
                id: taskIds[ 0 ],
                uid: i === 0 ? taskUids[ 0 ] : taskUids[ 1 ],
            } as TaskInstance ), new Map() as TaskInstanceIndex );
        expect( () => taskIndexFromInstances( instances ) )
            .toThrow( 'Task uids and ids must match.' )
    } );

    test( 'Several instances several tasks', () => {
        const instances = filePaths.reduce( ( idx, fp, i ) =>
            idx.set( instanceIndexKey( fp, 0 ), {
                ...emptyTaskInstance(),
                filePath: fp,
                name: taskNames[ i ],
                id: taskIds[ i ],
                uid: taskUids[ i ]
            } ), {} as TaskInstanceIndex );
        const tasks = [ ...taskIndexFromInstances( instances ).values() ];
        expect( tasks ).toHaveLength( 10 )
        for ( const task of tasks ) {
            expect( task.locations ).toHaveLength( 1 );
        }
    } );
} )