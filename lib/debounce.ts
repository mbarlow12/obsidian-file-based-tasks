import Timeout = NodeJS.Timeout;

export interface AsyncDebouncer<T extends unknown[]> {
    ( ...args: [ ...T ] ): Promise<void>,

    cancel(): Promise<this>
}

export function asyncDebounce<A extends unknown[]>( fn: ( ...args: [ ...A ] ) => void | Promise<void>, wait: number ) {
    let timeout: Timeout;

    const debounced: AsyncDebouncer<A> = ( ...debArgs: [ ...A ] ) => new Promise( resolve => {
        if ( timeout ) {
            clearTimeout( timeout );
        }
        timeout = setTimeout( () => {
            const r = fn( ...debArgs );
            if ( r instanceof Promise )
                return r.then( ret => resolve( ret ) );
            else
                resolve( r );
        }, wait );
    } );

    debounced.cancel = async () => {
        clearTimeout( timeout );
        return this;
    }

    return debounced;
}