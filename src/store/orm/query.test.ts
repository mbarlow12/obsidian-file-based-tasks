import { emptyTask } from './models';
import { Operator, queryToComparer, TaskQuery } from './query';
import { ITask } from './types';

describe( 'TaskQuery', () => {

    it( 'should handle a single query block', () => {
        const q: TaskQuery = [ 'name', Operator.EQ, 'task 1' ];
        const comparer = queryToComparer( q );
        const task: ITask = {
            ...emptyTask(),
            name: 'task 1'
        };
        expect( comparer( task ) ).toEqual( true );
    } );

    it( 'should handle all operators', () => {
        let q: TaskQuery = [ 'id', Operator.GT, 1 ];
        let task: ITask = {
            ...emptyTask(),
            id: 1
        };
        expect( queryToComparer( q )( task ) ).toBeFalsy()

        q = [ 'id', Operator.GTE, 1 ];
        expect( queryToComparer( q )( task ) ).toBeTruthy();

        q = [ 'name', Operator.LT, 'task 2' ];
        task = { ...emptyTask(), name: 'task 1' };
        expect( queryToComparer( q )( task ) ).toBeTruthy();
        q = [ 'id', Operator.LT, 5 ];
        task = { ...emptyTask(), id: 5 };
        expect( queryToComparer( q )( task ) ).toBeFalsy();
        q = [ 'id', Operator.LTE, 5 ];
        expect( queryToComparer( q )( task ) ).toBeTruthy();
        q = [ 'id', Operator.NE, 5 ];
        expect( queryToComparer( q )( task ) ).toBeFalsy();
        task = { ...emptyTask(), id: 1 }
        expect( queryToComparer( q )( task ) ).toBeTruthy();
        const d = new Date().getTime();
        q = [ 'created', Operator.NE, d ];
        expect( queryToComparer( q )( { ...task, created: new Date( '01/01/22' ).getTime() } ) ).toBeTruthy();
        task = { ...emptyTask(), created: new Date( d ).getTime() };
        expect( queryToComparer( q )( task ) ).toBeFalsy();
        q = ['childIds', Operator.NE, [1]];
        task = { ...emptyTask(), childIds: [1]};
        expect(queryToComparer(q)(task)).toBeFalsy();

        q = [ 'name', Operator.LIKE, '1 or 2' ];
        task = { ...emptyTask(), name: 'task 1 or 2 task' };
        expect(queryToComparer(q)(task)).toBeTruthy();
        task = { ...emptyTask(), name: 'task 1, 2' };
        expect(queryToComparer(q)(task)).toBeFalsy();
        q = ['id', Operator.LIKE, 'nope'];
        expect(queryToComparer(q)(task)).toBeFalsy();
        q = ['childIds', Operator.LIKE, [1]];
        task = { ...emptyTask(), childIds: [1]};
        expect(queryToComparer(q)(task)).toBeFalsy();
        q = ['childIds', Operator.INCLUDES, 1];

    } );
} );