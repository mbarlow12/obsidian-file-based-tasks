import { ParsedTask } from '../Task';
import { TaskParser } from './TaskParser';

/**
 * TODO invalid cases and handle reformatting
 *  - more than one x
 *  - missing [ or ]
 *  - other characters within brackets
 */


describe( 'Task parsing', () => {

    const parser = new TaskParser();


    test( 'Parse a single incomplete todo item', () => {
        const line = '- [ ] an incomplete todo';
        const t: ParsedTask = parser.parseLine( line );
        expect( t.complete ).toBe( false );
        expect( t.name ).toEqual( 'an incomplete todo' );
    } );

    test( 'Parse a single complete todo item', () => {
        const line = '- [x] a complete todo';
        const t: ParsedTask = parser.parseLine( line );
        expect( t.complete ).toBe( true );
        expect( t.name ).toEqual( 'a complete todo' );
    } );

    test( 'Parse a todo with a nested todo in the text', () => {
        const line = '- [x] a complete todo but here - [ ] is another oddity';
        const t: ParsedTask = parser.parseLine( line );
        expect( t.complete ).toEqual( true );
        expect( t.name ).toEqual( 'a complete todo but here - [ ] is another oddity' );
    } );

    test( 'Parse minimally valid tasks', () => {
        const items = [ '- []', '- [x]', '- [ ]', '  - [x]', '    - []' ]
        for ( const [ itemI, checkbox ] of items.entries() ) {
            const names = [ 'a', '|', '?', '.' ];
            for ( const [ i, name ] of names.entries() ) {
                const test = `${checkbox} ${name}`;
                const baseTask = parser.parseLine( test );
                const expectedStatus = itemI % 2 !== 0;
                if ( i === 0 ) {
                    expect( baseTask.complete ).toEqual( expectedStatus );
                    expect( baseTask.name ).toEqual( names[ i ] )
                }
                else
                    expect( baseTask ).toBeNull()
            }
        }
    } );

    test( 'Parser a series of invalid todos', () => {
        const items = [
            [ '- [  ]', '- [', '[ ]', '-[]', '-[ ]', '- ]' ].map( x => x.concat( ' ', 'incomplete task' ) ),
            [ '- [ x]', '- [x', '-[x]', '-[x ]', '[x]' ].map( x => x.concat( ' ', 'complete task' ) ),
            [ '- [x]         ', '- [ ] \t', '- [x]\n' ]
        ];
        for ( const bullets of items ) {
            for ( const bullet of bullets ) {
                expect( parser.parseLine( bullet ) ).toBeNull()
            }
        }
    } );

// recurrence tasks - (valid and invalid, combine with due date and tags, multiple recurrences
// due date tasks
// tags tasks

    test( 'Parse tags', () => {
        let line = '- [ ] task name #tag';
        const parser = new TaskParser();
        let pTask = parser.parseLine( line );
        expect( pTask.tags ).toBeTruthy();
        expect( pTask.tags ).toHaveLength( 1 );
        expect( pTask.tags[ 0 ] ).toEqual( 'tag' );
        expect( pTask.name ).toEqual( 'task name' );

        line = '- [ ] task name #firsttag #secondtag';
        pTask = parser.parseLine( line );
        expect( pTask.tags ).toBeTruthy();
        expect( pTask.tags ).toHaveLength( 2 );
        expect( pTask.tags ).toStrictEqual( [ 'firsttag', 'secondtag' ] );
        expect( pTask.name ).toEqual( 'task name' );
    } );

    test( 'Parse due dates', () => {
        const checkDate = new Date();
        checkDate.setDate( checkDate.getDate() + 1 );
        let line = '- [ ] test task @tomorrow';
        const parser = new TaskParser();
        let task = parser.parseLine( line );
        expect( task.dueDate ).toBeTruthy();
        expect( task.dueDate.toDateString() ).toEqual( checkDate.toDateString() );

        line = '- [ ] test task name #atag @next friday #anothertag';
        task = parser.parseLine( line );
        while ( checkDate.getDay() !== 5 )
            checkDate.setDate( checkDate.getDate() + 1 );
        checkDate.setDate( checkDate.getDate() + 7 );
        expect( task.dueDate.toDateString() ).toEqual( checkDate.toDateString() );

    } );

    test( 'Parse recurrences', () => {
    } );

    test( 'Parse links', () => {
        let line = '- [x] my first task with this stuff [[my first task with this stuff_186a1#^186a1|my first task with this stuff]] [[some other file#^186a1|my first task with this stuff]] ^186a1';
        const parser = new TaskParser();
        let pTask = parser.parseLine( line );
        expect( pTask.links ).toBeTruthy();
    } );

    test( 'Parse ids', () => {
        let line = '- [ ] test task ^abc1';
        let task = parser.parseLine(line);
        expect(task.id).toEqual('abc1');

        line = '- [ ] test task ^nope4 some more @Fri May 1 ^abc123'
        task = parser.parseLine(line);
        expect(task.id).toEqual('abc123');
        expect(task.name).toEqual('test task ^nope4 some more');
    } );

} )
