import { isEqual } from 'lodash';
import {
    emptyPosition,
    locationsEqual,
    PrimaryTaskInstance,
    Task,
    TaskInstance,
    taskLocation,
    taskLocationFromInstance
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
            const parent = instances.get( taskLocation( inst.filePath, parentLine ) );
            if ( !parent ) {
                inst.parent = -1;
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

        const parentA = instIdx.get( taskLocation( instA.filePath, instA.parent ) );
        const parentB = instIdx.get( taskLocation( instB.filePath, instB.parent ) );
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

export const getPrimaryInstance = (instance: TaskInstance, index: TaskInstanceIndex, taskDir = DEFAULT_TASKS_DIR) => {
    const filename = primaryTaskFilename(instance, taskDir);
    return index.get(taskLocation(filename, 0)) as PrimaryTaskInstance;
}
export const taskIndexFromInstances = ( instances: TaskInstanceIndex, taskDir = DEFAULT_TASKS_DIR ): TaskIndex => {
    validateInstanceIndex( instances );
    const idx: TaskIndex = new Map();
    for ( const [ loc, instance ] of instances ) {
        const task = idx.get( instance.uid ) || createTaskFromPrimary( getPrimaryInstance( instance, instances, taskDir ) );
        task.locations.push( loc );
        const parentLoc = taskLocation( instance.filePath, instance.parent );
        const parentInst = instances.get( parentLoc );
        if ( parentInst ) {
            const parentTask = idx.get( parentInst.uid ) || createTaskFromPrimary( getPrimaryInstance( parentInst, instances, taskDir ) );
            parentTask.childUids.push( instance.uid );
            parentTask.locations.push( parentLoc );
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
    const filteredIndex: TaskIndex = new Map();
    const instances: TaskInstance[][] = [];
    for ( const [ uid, task ] of taskIndex ) {
        if ( filter( task ) ) {
            if ( filteredIndex.has( uid ) )
                continue;
            const taskInsts = [ taskInstanceFromTask( filePath, 0, task ) ];
            const childUids = task.childUids.filter( cuid => filter( taskIndex.get( cuid ) ) );
            for ( const child of childUids ) {
                taskInsts.push( taskInstanceFromTask( filePath, 0, taskIndex.get( child ) ) );
                filteredIndex.set( child, taskIndex.get( child ) )
            }
            filteredIndex.set( uid, { ...task, childUids } );
            instances.push( taskInsts );
        }
    }
    const allInstances = instances.sort( (
        a,
        b
    ) => comparator( taskIndex.get( a[ 0 ].uid ), taskIndex.get( b[ 0 ].uid ) ) )
        .flat()
        .map( ( inst, i ) => ({ ...inst, position: emptyPosition( i ) }) );
    return new Map( allInstances.map( i => [ taskLocationFromInstance( i ), i ] ) );
}
export const filterIndexByPath = ( filePath: string, index: TaskInstanceIndex ): TaskInstanceIndex => {
    const filtered: TaskInstanceIndex = new Map();
    for ( const [ loc, instance ] of index ) {
        if ( loc.filePath === filePath )
            filtered.set( loc, instance );
    }
    return filtered;
}

export const deleteTaskUids = (uids: number[], index: TaskInstanceIndex) => {
    for ( const [loc, inst] of index.entries() ) {
        if (uids.includes(inst.uid))
            index.delete(loc)
    }
    return index;
}