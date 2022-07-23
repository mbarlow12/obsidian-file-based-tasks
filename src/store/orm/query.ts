import { arraysEqual } from './index';
import { ITask } from './types';

export enum Operator {
    EQ = 'EQ',
    GT = 'GT',
    GTE = 'GTE',
    LT = 'LT',
    LTE = 'LTE',
    NE = 'NE',
    LIKE = 'LIKE',
    INCLUDES = 'INCLUDES',
}

type ITaskNoInst = Omit<ITask, 'instances'>
export type TaskQueryBlock = [ keyof ITaskNoInst, Operator, ITaskNoInst[keyof ITaskNoInst] ];

export type TaskQuery =
    TaskQueryBlock
    | { and: (TaskQueryBlock | TaskQuery)[] }
    | { or: (TaskQueryBlock | TaskQuery)[] };

export enum SortDirection {
    ASC = 'ASC',
    DESC = 'DESC'
}

export type TaskSort = [ keyof ITask, SortDirection ];

export type IndexSetting = {
    query: TaskQuery,
    sort: TaskSort
}

export type IndexFileSettings = Record<string, IndexSetting>

export const isQueryBlock = ( tq: TaskQuery ): tq is TaskQueryBlock => {
    return (!('and' in tq) || !('or' in tq))
        && Array.isArray( tq )
        && tq.length === 3
        && typeof tq[ 0 ] === 'string';
}

export const DEFAULT_BACKLOG_SETTING: IndexSetting = {
    query: [ 'complete', Operator.EQ, false ],
    sort: [ 'created', SortDirection.ASC ]
}

export const DEFAULT_COMPLETED_SETTING: IndexSetting = {
    query: [ 'complete', Operator.EQ, true ],
    sort: [ 'completed', SortDirection.DESC ]
}

const inArray = <T>(
    arr: T[],
    elem: T,
    comp = ( a: T, b: T ) => a === b
) => {
    return arr.findIndex(aElem => comp(aElem, elem)) !== -1;
}

export const parseQueryBlock = ( qb: TaskQueryBlock, task: ITaskNoInst ) => {
    const [ field, op ] = qb;
    let [ , , value ] = qb;
    if ( value instanceof Date )
        value = value.toISOString();
    const { EQ, GTE, LIKE, GT, INCLUDES, LT, LTE, NE } = Operator;
    let tField = task[ field ];
    if ( tField instanceof Date )
        tField = tField.toISOString();
    const eitherArray = Array.isArray( tField ) || Array.isArray( value );
    switch ( op ) {
        case EQ:
            if ( Array.isArray( tField ) ) {
                if ( !Array.isArray( value ) )
                    return false;
                return arraysEqual( tField.sort().map( e => `${e}` ), value.sort().map( e => `${e}` ) );
            }
            if ( Array.isArray( value ) )
                return false;
            return tField === value
        case GT:
            if ( eitherArray )
                return false;
            return tField > value;
        case GTE:
            if ( eitherArray )
                return false;
            return tField >= value;
        case LTE:
            if ( eitherArray )
                return false;
            return tField <= value;
        case LIKE:
            if ( typeof tField === 'number' && typeof value === 'number' )
                return tField === value;
            if ( typeof tField !== 'string' || typeof value !== 'string' )
                return false
            return tField.includes( value );
        case INCLUDES:
            return Array.isArray( tField ) && inArray( tField, value )
        case LT:
            if ( eitherArray )
                return false;
            return tField < value;
        case NE:
            if (Array.isArray(tField)) {
                if (!Array.isArray(value))
                    return true;
                return !arraysEqual( tField.sort().map( e => `${e}` ), value.sort().map( e => `${e}` ) );
            }
            if (Array.isArray(value))
                return true;
            return tField !== value
        default:
            return true
    }
}

export const queryToComparer = ( tq: TaskQuery ): ( t: ITaskNoInst ) => boolean => {
    if ( isQueryBlock( tq ) )
        return t => parseQueryBlock( tq, t );

    if ( 'and' in tq )
        return t => tq.and.reduce( ( val, recTq ) => val && queryToComparer( recTq )( t ), true );
    else
        return t => tq.or.reduce( ( val, reqTq ) => val || queryToComparer( reqTq )( t ), false );
}