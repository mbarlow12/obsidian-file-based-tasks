import {ITask} from "./types";

export { Task } from './Task'
export * from "./types"

export const emptyTask: Omit<ITask, 'name'|'complete'> = {
    locations: [],
    created: 0,
    updated: 0,
    children: []
}

export const taskid = (len: number): string => {
    let result           = '';
    const characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for ( let i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }
    return result;
}