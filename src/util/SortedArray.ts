export type Comparator<T> = ( a: T, b: T ) => number;
export type FilterPredicate<T> = ( val: T, i: number, array: T[] ) => boolean;

export class SortedArray<T> extends Array<T> {

    private comparator: Comparator<T>;

    constructor();
    constructor(arg: number);
    constructor(elems: Array<T>, comparator?: Comparator<T>);
    constructor( elems?: Array<T>|number, comparator?: Comparator<T> ) {
        if (Array.isArray(elems))
            super( ...(elems.sort( comparator )) );
        else if (typeof elems === 'number')
            super(elems);
        else
            super()
        Object.setPrototypeOf( this, SortedArray<T>.prototype );
        this.comparator = comparator;
    }

    find(
        predicate: ( value: T, index: number, obj: T[] ) => boolean,
        thisArg?: any
    ): T | undefined {
        const i = this.findIndex(predicate);
        if ( i >= 0 )
            return this[i];
    }

    map<U>( fn: ( value: T, i: number, arr: SortedArray<T> ) => U, thisArg?: any ): U[] {
        const ret: U[] = new Array<U>( this.length );
        for ( let i = 0; i < this.length; i++ ) {
            ret[ i ] = fn( this[ i ], i, this );
        }
        return ret;
    }

    findInsertIndex( elem: T ): number {
        let lo = 0,
            hi = this.length - 1,
            mid: number,
            found: number;

        while ( lo <= hi ) {
            mid = (lo + hi) >>> 1;
            found = this.comparator( this[ mid ], elem );
            if ( found === 0 )
                return mid;
            else if ( found > 0 )
                hi = mid - 1;
            else
                lo = mid + 1;
        }
        return ~lo;
    }

    isSorted() {
        for ( let i = 0; i < this.length - 1; i++ ) {
            if ( this.comparator( this[ i ], this[ i + 1 ] ) > 0 )
                return false;
        }
        return true;
    }

    filter( pred: FilterPredicate<T> ): SortedArray<T> {
        const ret = [];
        for ( let i = 0; i < this.length; i++ ) {
            if ( pred( this[ i ], i, this ) )
                ret.push( this[ i ] );
        }
        return new SortedArray( ret, this.comparator );
    }

    insert( elems: T[] | T, replace = false ) {
        if ( !Array.isArray( elems ) )
            elems = [ elems ];
        const newElems = new SortedArray( elems, this.comparator );
        const startIndex = this.findInsertIndex( newElems[ 0 ] );
        let currentInsertIndex = startIndex;
        if ( startIndex < 0 )
            currentInsertIndex = ~startIndex;
        const deleteCount = ( a: T, b: T ) => replace && this.comparator( a, b ) === 0 ? 1 : 0;
        this.splice( currentInsertIndex,  deleteCount(newElems[0], this[currentInsertIndex]), newElems[ 0 ] );
        for ( let i = 1; i < newElems.length; i++ ) {

            while ( this.comparator( newElems[ i ], this[ currentInsertIndex ] ) > 0 && currentInsertIndex < this.length - 1 )
                currentInsertIndex++;

            if (currentInsertIndex === this.length - 1) {
                this.push(...newElems.slice(i));
                break;
            }

            this.splice( currentInsertIndex, deleteCount( elems[ i ], this[ currentInsertIndex ] ), elems[ i ] )
        }
    }
}
