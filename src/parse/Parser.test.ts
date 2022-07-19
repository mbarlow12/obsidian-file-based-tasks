import { ListItemCache, Pos } from 'obsidian';
import { taskIdToUid } from '../redux';
import { pos } from '../Task';
import { Parser } from './Parser';
import { ParsedTask } from './types';

/**
 * TODO invalid cases and handle reformatting
 *  - more than one x
 *  - missing [ or ]
 *  - other characters within brackets
 */


export const emptyPosition = ( line: number ): Pos => pos( line, 0, 0, 0, 0, 0 );

describe( 'Task parsing', () => {

    let parser: Parser;
    const lic: ListItemCache = { id: '', parent: -1, position: emptyPosition( 0 ) };

    beforeEach( () => {
        parser = new Parser();
    } )


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

    test( 'Parse tasks with link names', () => {
        let line = '- [ ] [[task name]] #tag1 [[a link for this]]';
        let task = parser.parseLine( line );
        expect( task.name ).toEqual( '[[task name]] #tag1 [[a link for this]]' );
        expect( task.tags ).toBeTruthy();
        expect( task.tags[ 0 ] ).toEqual( 'tag1' );
        expect( task.links ).toBeTruthy();
        expect( task.links ).toHaveLength( 2 );
        expect( task.links[ 0 ] ).toEqual( 'task name' );
        expect( task.links[ 1 ] ).toEqual( 'a link for this' );

        line = '- [ ] [[task name with #illegal [[chars]]]]';
        task = parser.parseLine( line );
        expect( task.name ).toEqual( 'task name with #illegal [[chars]]' )

    } );

    test( 'parse a series of invalid todos', () => {
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
        const parser = new Parser();
        let pTask = parser.parseLine( line );
        expect( pTask.tags ).toBeTruthy();
        expect( pTask.tags ).toHaveLength( 1 );
        expect( pTask.tags[ 0 ] ).toEqual( 'tag' );
        expect( pTask.name ).toEqual( 'task name #tag' );

        line = '- [ ] task name #firsttag #secondtag';
        pTask = parser.parseLine( line );
        expect( pTask.tags ).toBeTruthy();
        expect( pTask.tags ).toHaveLength( 2 );
        expect( pTask.tags ).toStrictEqual( [ 'firsttag', 'secondtag' ] );
        expect( pTask.name ).toEqual( 'task name #firsttag #secondtag' );
    } );

    test( 'Parse due dates', () => {
        const checkDate = new Date();
        checkDate.setDate( checkDate.getDate() + 1 );
        let line = '- [ ] test task @tomorrow';
        const parser = new Parser();
        let task = parser.parseLine( line );
        expect( task.dueDate ).toBeTruthy();
        expect( task.dueDate.toDateString() ).toEqual( checkDate.toDateString() );

        line = '- [ ] test task name #atag @next friday #anothertag';
        task = parser.parseLine( line );
        while ( checkDate.getDay() !== 0 )
            checkDate.setDate( checkDate.getDate() + 1 );
        checkDate.setDate(checkDate.getDate() + 5);
        expect( task.dueDate.toDateString() ).toEqual( checkDate.toDateString() );

    } );

    // test( 'Parse recurrences', () => {
    //     let line = '- [x] task with recurrence &every monday';
    //     const parser = new Parser();
    //     let pTask = parser.parseLine( line );
    //     expect( pTask.recurrence ).toBeTruthy();
    //     expect(pTask.recurrence.toText().toLowerCase()).toEqual('every week on monday')
    //     expect(pTask.name).toEqual('task with recurrence &every monday')
    //
    //     line = '- &every tuesday task 4';
    //     pTask = parser.parseLine(line);
    //     expect(pTask).toBeNull();
    // } );

    test( 'Parse links', () => {
        let line = '- [x] my first task with this stuff [[my first task with this stuff_186a1#^186a1|my first task with this stuff]] [[some other file#^186a1|my first task with this stuff]] ^186a1';
        const parser = new Parser();
        let pTask = parser.parseLine( line );
        expect( pTask.links ).toBeTruthy();
        expect( pTask.links ).toEqual( [
            'my first task with this stuff_186a1#^186a1|my first task with this stuff',
            'some other file#^186a1|my first task with this stuff'
        ] )
        expect( pTask.name )
            .toEqual( 'my first task with this stuff [[my first task with this stuff_186a1#^186a1|my first task with this stuff]] [[some other file#^186a1|my first task with this stuff]]' )

        line = '- [ ] [[link 1]] some text [[link 2|link 2 display]] #cool #work &every monday for 3 times';
        pTask = parser.parseLine( line );
        expect( pTask.tags ).toEqual( [ 'cool', 'work' ] );
        // expect(pTask.recurrence.toText().toLowerCase()).toEqual('every week on monday for 3 times')
        expect( pTask.links ).toEqual( [ 'link 1', 'link 2|link 2 display' ] )
    } );

    test( 'Parse ids', () => {
        let line = '- [ ] test task ^abc1';
        let task = parser.parseLine( line );
        expect( task.id ).toEqual( taskIdToUid( 'abc1' ) );

        line = '- [ ] test task ^nope4 some more @Fri May 1 ^abc123'
        task = parser.parseLine( line );
        expect( task.id ).toEqual( taskIdToUid( 'abc123' ) );
        expect( task.name ).toEqual( 'test task ^nope4 some more @Fri May 1' );
    } );

    test( 'parse data within links', () => {
        let line = '- [ ] [[a simple link task]]';
        let task = parser.parseLine( line );
        expect( task.name ).toEqual( 'a simple link task' );
        expect( task.id ).toEqual( 0 );
        expect( task.links ).toHaveLength( 1 );
        expect( task.links ).toStrictEqual( [ 'a simple link task' ] );

        line = '- [ ] [[a link task with id (abc3)]]';
        task = parser.parseLine( line );
        expect( task.name ).toEqual( 'a link task with id' );
        expect( task.id ).toEqual( taskIdToUid( 'abc3' ) );

        line = '- [ ] [[a link task with id (abc3)]] ^abc3';
        task = parser.parseLine( line );
        expect( task.name ).toEqual( 'a link task with id' );
        expect( task.id ).toEqual( taskIdToUid( 'abc3' ) );

        line = '- [ ] [[task/dir/a link task with id (abc3)]] ^abc3';
        task = parser.parseLine( line );
        expect( task.name ).toEqual( 'a link task with id' );
        expect( task.id ).toEqual( taskIdToUid( 'abc3' ) );
        expect( task.links ).toEqual( [ 'task/dir/a link task with id (abc3)' ] );

        line = '- [ ] [[task/dir/a link task with id (abc3)#heading|a heading]] ^abc3';
        task = parser.parseLine( line );
        expect( task.name ).toEqual( 'a link task with id' );
        expect( task.id ).toEqual( taskIdToUid( 'abc3' ) );


        line = '- [ ] [[task/dir/a link task#heading|a heading]] ^abc3';
        task = parser.parseLine( line );
        expect( task.name ).toEqual( 'a link task#heading|a heading' );
        expect( task.id ).toEqual( taskIdToUid( 'abc3' ) );

        line = '- [ ] [[a link task with id (abc1)]] ^abc3';
        task = parser.parseLine( line );
        expect( task.name ).toEqual( 'a link task with id' );
        expect( task.id ).toEqual( taskIdToUid( 'abc3' ) );

        line = '- [ ] [[a link task with id (idnum1)]] some additional text';
        task = parser.parseLine( line );
        expect( task.name ).toEqual( '[[a link task with id (idnum1)]] some additional text' );
        expect( task.id ).toEqual( 0 );
        expect( task.links ).toStrictEqual( [ 'a link task with id (idnum1)' ] )

        line = '- [ ] [[a link task with id]] some additional text';
        task = parser.parseLine( line );
        expect( task.name ).toEqual( '[[a link task with id]] some additional text' );
        expect( task.id ).toEqual( 0 );
        expect( task.links ).toStrictEqual( [ 'a link task with id' ] )

        line = '- [ ] #will match [[a link task with id]] some additional text';
        task = parser.parseLine( line );
        expect( task.name ).toEqual( '#will match [[a link task with id]] some additional text' )
        expect( task.tags ).toEqual( [ 'will' ] )
        expect( task.links ).toEqual( [ 'a link task with id' ] )

        line = '- [ ] #will match [[a link task with id (id44)]] some additional text ^abc3';
        task = parser.parseLine( line );
        expect( task.name ).toEqual( '#will match [[a link task with id (id44)]] some additional text' )
        expect( task.tags ).toEqual( [ 'will' ] )
        expect( task.links ).toEqual( [ 'a link task with id (id44)' ] )
        expect( task.id ).toEqual( taskIdToUid( 'abc3' ) )

        line = '- #will match [[a link task with id (id44)]] some additional text ^cde2';
        task = parser.parseListItemLine( line, 'path.md', lic );
        expect( task.name ).toEqual( '#will match [[a link task with id (id44)]] some additional text' )
        expect( task.tags ).toEqual( [ 'will' ] )
        expect( task.links ).toEqual( [ 'a link task with id (id44)' ] )
        expect( task.id ).toEqual( taskIdToUid( 'cde2' ) )
    } );

    test( 'normalize task file name', () => {
        let normalized = Parser.normalizeName( 'simple task name' );
        expect( normalized ).toEqual( 'simple task name' );

        normalized = Parser.normalizeName( 'task name with [[link]]' )
        expect( normalized ).toEqual( 'task name with link' )

        normalized = Parser.normalizeName( '#tagged task name' );
        expect( normalized ).toEqual( 'tagged task name' );

        normalized = Parser.normalizeName( '[[task name inside | piped link]]' );
        expect( normalized ).toEqual( 'task name inside piped link' );

        normalized = Parser.normalizeName( '[[task name inside|piped link with^idblock]]' );
        expect( normalized ).toEqual( 'task name inside piped link with idblock' );

        normalized = Parser.normalizeName( '[[task name with#|^multiple|||||simultaneous[[]][chars]]' );
        expect( normalized ).toEqual( 'task name with multiple simultaneous chars' );

        normalized = Parser.normalizeName( 'task name with#|^multiple|||||simultaneous[[]][chars &every tuesday' );
        expect( normalized ).toEqual( 'task name with multiple simultaneous chars &every tuesday' );

        normalized = Parser.normalizeName( 'task name with#|^multiple|||||simultaneous[[]][chars &every tuesday @2pm' );
        expect( normalized ).toEqual( 'task name with multiple simultaneous chars &every tuesday @2pm' );

        normalized =
            Parser.normalizeName( 'long/task/dir/task name with#|^multiple|||||simultaneous[[]][chars &every tuesday @2pm' );
        expect( normalized ).toEqual( 'long task dir task name with multiple simultaneous chars &every tuesday @2pm' );
    } )

    test( 'rendered task lines', () => {
        let line = `- [x] here's a [[a different name (443nd)]] another [[here's a a different name (443nd) another (3ad).md]] ^3ad`;
        let task = parser.fullParseLine( line, 'file.md', lic );
        expect( task.id ).toEqual( taskIdToUid( '3ad' ) );

        expect( () => {
            line =
                `- [x] here's a [[a different name (443nd)]] another [[here's a a different (443nd) another (3ad).md]] ^3ad`;
            task = parser.fullParseLine( line, 'file.md', lic );
        } ).toThrow( Error );

        line = `     - [ ] [[another linked one (abc1)]] ^abc1`;
        task = parser.fullParseLine( line, 'file.md', lic);
        expect(task.id).toEqual(taskIdToUid('abc1'));
    } );

} )
