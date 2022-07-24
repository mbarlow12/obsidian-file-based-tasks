import { Model, Ref } from 'redux-orm';

export type RefFilter<T extends Model> = ( arg: Ref<T> ) => boolean;

export interface ITaskBase {
    id: number;
    name: string;
    complete: boolean;
    tags: string[];
    completed?: number;
}

export interface IBaseTask extends ITaskBase {
    content: string;
    created: number;
    parentIds: number[];
    childIds: number[];
}

export interface ITaskInstance extends ITaskBase {
    rawText: string;
    filePath: string;
    line: number;
    parentLine: number;
    parentInstance?: ITaskInstance;
    childLines: number[];
    instanceChildren?: ITaskInstance[];
    dueDate?: number;
    links: string[];
}

export interface ITask extends IBaseTask {
    dueDate: number;
    instances: ITaskInstance[];
}

export type ITaskCreate = Omit<Partial<ITask>, 'name'> & { name: string };

export type ITaskInstanceRecord = Record<string, ITaskInstance>;
export type FileITaskInstanceRecord = Record<number, ITaskInstance>;

// export type Row<T> = [ ...(keyof T) ]

// type UnionToIntersection<U> = (
//   U extends never ? never : (arg: U) => never
// ) extends (arg: infer I) => void
//   ? I
//   : never;
//
// export type UnionToTuple<T> = UnionToIntersection<
//   T extends never ? never : (t: T) => T
// > extends (_: never) => infer W
//   ? [...UnionToTuple<Exclude<T, W>>, W]
//   : [];
//
// export type ValueUnionToTuple<T, K extends keyof T> = UnionToIntersection<
//     K extends never ? never : (t: K) => K
// > extends (_: never) => infer W
//     ? [ ...ValueUnionToTuple<T, Exclude<K, W>>, T[W]]
//     : [];
//
// export interface Simple {
//     name: string;
//     id: number;
//     created: number;
//     due: number;
//     complete: boolean;
//     completed: number;
//     content: string;
// }
// const vals = <T>(obj: T, fields: UnionToTuple<keyof T>) => fields.map((f: keyof T) => obj[f]);
// const s: Simple = {
//     name: 'name',
//     id: 1,
//     created: 2,
//     due: 3,
//     complete: false,
//     completed: 4,
//     content: 'content',
// };
// type KS = keyof Simple;
// const c: UnionToTuple<KS> = ['name', 'content', 'created', 'id', 'complete', 'completed', 'due'];
// const f = vals(s, c);

// type ObjUnionToTuple<T> = UnionToIntersection<keyof T> extends (_: never ) => infer W
//     ? [...ObjUnionToTuple<Omit<T, Exclude<keyof T, W>>>, T[W]]
//                              : []
//
// type SimpleKeys = UnionToTuple<KS>;
// const c: UnionToTuple<Exclude<KS, 'due'>> = ['name', 'content', 'created', 'id', 'complete', 'completed'];
// const d: ObjUnionToTuple<Simple> = ['hello', '', new Date().getTime(), 12, true, 11293];
// type Val<T, K extends keyof T> = []

// const fNames: U2T<keyof ITaskInstance> = [
//     'name', 'dueDate', 'id', 'complete', 'tags', 'completed', 'rawText', 'filePath', 'line', 'parentLine',
//     'parentInstance', 'childLines', 'instanceChildren', 'links'
// ]




