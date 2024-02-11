export interface StoreIndex<T> {
    add(item: T): boolean;
    delete(itemOrId: T | number): T | void;
    update(item: T): T;
    upsert(item: T): T;
    fetch(id: keyof T): T | null;
    fetchAll(id: Array<keyof T>): T[];
}