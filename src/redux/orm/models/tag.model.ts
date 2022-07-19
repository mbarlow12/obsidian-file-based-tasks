import { attr, IdOrModelLike, Model, QuerySet } from 'redux-orm';
import { Task } from '../models';

export interface TagFields {
    name: string,
    tasks?: QuerySet<Task>,
}

export class Tag extends Model<typeof Tag, TagFields> {
    static modelName = 'Tag' as const;
    static fields = {
        name: attr(),
    }
    static options = {
        idAttribute: 'name' as const
    }

    constructor( props: TagFields ) {
        super( props );
    }
}

export const tagsEqual = ( a: IdOrModelLike<Tag>, b: IdOrModelLike<Tag> ) => {
    if ( typeof a !== 'string' )
        a = a.getId();
    if ( typeof b !== 'string' )
        b = b.getId()
    return a === b;
}