import {Events as ObsEvents} from 'obsidian';
import {IAnonymousTask, ITask, Task} from "../Task";
import {EventType, IndexUpdatedAction, UpdateType} from "./types";


export class TaskEvents {
    private _events: ObsEvents;

    /**
     * note: passing in Workspace for now
     * @param obsidianEvents
     */
    constructor(obsidianEvents: ObsEvents) {
        this._events = obsidianEvents;
    }

    triggerRequestDeleteTask(taskName: string) {
        this._events.trigger(EventType.REQUEST_DELETE_TASK, taskName);
    }

    registerRequestDeleteTaskHandler(cb: (taskName: string) => void) {
        return this._events.on(EventType.REQUEST_DELETE_TASK, cb);
    }

    triggerRequestDeleteFile(filePath: string, taskRecord?: Record<number, IAnonymousTask>) {
        this._events.trigger(EventType.REQUEST_DELETE_FILE, {filePath, taskRecord});
    }

    registerRequestDeleteFileHandler(cb: (arg: {filePath: string, taskRecord: Record<number, ITask>}) => void) {
        return this._events.on(EventType.REQUEST_DELETE_FILE, cb);
    }

    triggerRequestIndexUpdate(filePath: string, taskRecord: Record<number, ITask>) {
        this._events.trigger(EventType.REQUEST_UPDATE_INDEX, {filePath, taskRecord});
    }

    registerRequestIndexUpdateHandler(cb: (arg: {filePath: string, taskRecord: Record<number, ITask>}) => void) {
        return this._events.on(EventType.REQUEST_UPDATE_INDEX, cb);
    }

    triggerIndexUpdate(tasks: Task[], type: UpdateType) {
        const action: IndexUpdatedAction = {
            type,
            data: tasks
        };
        this._events.trigger(EventType.INDEX_UPDATE, action)
    }

    registerIndexUpdateHandler(handler: (action: IndexUpdatedAction) => void) {
        return this._events.on(EventType.INDEX_UPDATE, handler);
    }
}