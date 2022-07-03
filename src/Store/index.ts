import { isEqual } from 'lodash';
import {
    emptyPosition,
    instanceIndexKey,
    locationsEqual,
    PrimaryTaskInstance,
    Task,
    TaskInstance,
    taskLocation
} from '../Task';
import { createTaskFromPrimary, taskInstanceFromTask } from '../Task/Task';
import { DEFAULT_TASKS_DIR } from '../TaskFileManager';
import { Operator, TaskQueryBlock } from '../taskManagerSettings';
import { Comparator } from '../util/SortedArray';
import { filterUnique, primaryTaskFilename, validateInstanceIndex } from './TaskStore';
import { TaskIndex, TaskInstanceIndex } from './types';

export const handleCompletions = ( instances: TaskInstanceIndex ) => {
    for ( const [ loc, inst ] of instances ) {
        let parentLine = inst.parent;
        while ( parentLine > -1 ) {
            const parent = instances.get( instanceIndexKey( inst.filePath, parentLine ) );
            if ( !parent ) {
                parentLine = -1;
                continue;
            }
            if ( parent.complete )
                inst.complete = parent.complete;
            parentLine = parent.parent;
        }
        instances.set( loc, inst );
    }
    return instances;
}

export const taskInstancesAreSameTask = (
    instA: TaskInstance,
    instB: TaskInstance,
    instIdx: TaskInstanceIndex,
) => {
    if ( instA.uid === 0 || instB.uid === 0 ) {
        if (
            instA.name !== instB.name ||
            !isEqual( instA.tags?.sort(), instB.tags?.sort() ) ||
            instA.recurrence !== instB.recurrence ||
            instA.dueDate !== instB.dueDate ||
            (-1 in [ instA.parent, instB.parent ] && instA.parent !== instB.parent)
        )
            return false;

        const parentA = instIdx.get( instanceIndexKey( instA.filePath, instA.parent ) );
        const parentB = instIdx.get( instanceIndexKey( instB.filePath, instB.parent ) );
        if ( (parentA && parentB) && taskInstancesAreSameTask( parentA, parentB, instIdx ) )
            return false;

        const childrenA = new Set()
        const childrenB = new Set()
        for ( const inst of instIdx.values() ) {
            if ( inst.filePath === instA.filePath && inst.parent === instA.position.start.line )
                childrenA.add( inst.name )
            if ( inst.filePath === instB.filePath && inst.parent === instB.position.start.line )
                childrenB.add( inst.name )
        }
        if (
            (childrenA.size !== childrenB.size) ||
            [ ...childrenA ].filter( ca => !childrenB.has( ca ) ).length !== 0 ||
            [ ...childrenB ].filter( cb => !childrenA.has( cb ) ).length !== 0
        )
            return false;
    }
    else {
        return instA.uid === instB.uid;
    }
    return true;
}

export const getPrimaryInstance = ( instance: TaskInstance, index: TaskInstanceIndex, taskDir = DEFAULT_TASKS_DIR ) => {
    const filename = primaryTaskFilename( instance, taskDir );
    return index.get( instanceIndexKey( filename, 0 ) ) as PrimaryTaskInstance;
}
export const taskIndexFromInstances = ( instances: TaskInstanceIndex, taskDir = DEFAULT_TASKS_DIR ): TaskIndex => {
    validateInstanceIndex( instances );
    const idx: TaskIndex = new Map();
    for ( const instance of instances.values() ) {
        const task = idx.get( instance.uid ) || createTaskFromPrimary( getPrimaryInstance( instance, instances, taskDir ) );
        task.locations.push( taskLocation( instance ) );
        const parentLoc = instanceIndexKey( instance.filePath, instance.parent );
        const parentInst = instances.get( parentLoc );
        if ( parentInst ) {
            const parentTask = idx.get( parentInst.uid ) || createTaskFromPrimary( getPrimaryInstance( parentInst, instances, taskDir ) );
            parentTask.childUids.push( instance.uid );
            parentTask.locations.push( taskLocation( parentInst ) );
            idx.set( parentInst.uid, {
                ...parentTask,
                childUids: filterUnique( parentTask.childUids ),
                locations: filterUnique( parentTask.locations, locationsEqual )
            } );
            task.parentUids.push( parentTask.uid );
        }
        idx.set( instance.uid, {
            ...task,
            parentUids: filterUnique( [ ...task.parentUids ] ),
            locations: filterUnique( task.locations, locationsEqual )
        } )
    }
    return idx;
}
export const queryTask = ( t: Task, { value, field, op }: TaskQueryBlock ) => {
    const tVal = t[ field ];
    switch ( op ) {
        case Operator.EQ:
            return tVal === value;
        case Operator.GT:
            return tVal > value;
        case Operator.INCLUDES:
            return Array.isArray( tVal ) && tVal.findIndex( tv => tv === value ) > -1;
        case Operator.GTE:
            return tVal >= value;
        case Operator.LIKE:
            return typeof tVal === 'string' && tVal.includes( value.toString() );
        case Operator.LT:
            return tVal < value;
        case Operator.LTE:
            return tVal <= value;
        case Operator.NE:
            return tVal !== value;
    }
}
export const createIndexFileTaskInstances = (
    filePath: string,
    taskIndex: TaskIndex,
    filter: ( t: Task ) => boolean = ( t: Task ) => true,
    comparator: Comparator<Task> = ( a, b ) => a.created.getTime() - b.created.getTime()
): TaskInstanceIndex => {
    const instances: TaskInstance[][] = [];
    let currInstanceLine = 0;
    const orderedTasks = [ ...taskIndex.entries() ].sort( ( [ , tA ], [ , tB ] ) => comparator( tA, tB ) );
    const seenUids: Set<number> = new Set();
    for ( const [ uid, task ] of orderedTasks ) {
        if ( filter( task ) ) {
            if ( seenUids.has( uid ) )
                continue;
            const taskInsts: TaskInstance[] = [ {
                ...taskInstanceFromTask( filePath, 0, task ),
                links: task.locations.map(l => l.filePath)
            } ]
            const childUids = task.childUids.filter( cuid => filter( taskIndex.get( cuid ) ) );
            const childUidsAndParents = childUids.map( cuid => [ currInstanceLine, cuid ] );
            while ( childUidsAndParents.length > 0 ) {
                const [ pLine, cuid ] = childUidsAndParents.shift();
                const currChild = taskIndex.get( cuid );
                if ( currChild.childUids.length > 0 ) {
                    childUidsAndParents.unshift(
                        ...currChild.childUids.filter( cuid => filter( taskIndex.get( cuid ) ) )
                            .map( cuid => [ pLine + 1, cuid ] )
                    );
                }
                taskInsts.push( {
                    ...taskInstanceFromTask( filePath, 0, taskIndex.get( cuid ) ),
                    parent: pLine,
                    links: task.locations.map( l => l.filePath )
                } );
                seenUids.add( cuid )
            }
            currInstanceLine += taskInsts.length;
            seenUids.add( uid );
            instances.push( taskInsts );
        }
    }
    const allInstances = instances.sort( (
        a,
        b
    ) => comparator( taskIndex.get( a[ 0 ].uid ), taskIndex.get( b[ 0 ].uid ) ) )
        .flat()
        .map( ( inst, i ) => ({ ...inst, position: emptyPosition( i ) }) );
    return new Map( allInstances.map( i => [ instanceIndexKey( i ), i ] ) );
}

export const getFileIndexes = ( index: TaskInstanceIndex ) => {
    const fileIndexes: Map<string, TaskInstanceIndex> = new Map();
    for ( const [ locStr, inst ] of index ) {
        if ( !fileIndexes.has( inst.filePath ) )
            fileIndexes.set( inst.filePath, new Map() );
        fileIndexes.get( inst.filePath ).set( locStr, { ...inst } );
    }
    return fileIndexes;
}

export const filterIndexByPath = ( filePath: string, index: TaskInstanceIndex ): TaskInstanceIndex => {
    const filtered: TaskInstanceIndex = new Map();
    for ( const [ loc, instance ] of index ) {
        if ( instance.filePath === filePath )
            filtered.set( loc, instance );
    }
    return filtered;
}

export const deleteTaskUids = ( uids: number[], index: TaskInstanceIndex ) => {
    for ( const [ loc, inst ] of index.entries() ) {
        if ( uids.includes( inst.uid ) )
            index.delete( loc )
    }
    return index;
}