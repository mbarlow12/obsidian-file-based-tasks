import {Events as ObsEvents} from 'obsidian';
import {ITask} from "../Task";
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

    registerRequestIndexUpdateHandler(cb: (arg: {filePath: string, taskRecord: Record<number, ITask>}) => void) {
        return this._events.on(EventType.REQUEST_UPDATE_INDEX, cb);
    }

    triggerIndexUpdate(data: {index: Record<number, ITask>, locations: Record<string, number>}) {
        const action: IndexUpdatedAction = {
            type: UpdateType.MODIFY,
            data
        };
        this._events.trigger(EventType.INDEX_UPDATE, action)
    }

    registerIndexUpdateHandler(handler: (action: IndexUpdatedAction) => void) {
        return this._events.on(EventType.INDEX_UPDATE, handler);
    }
}