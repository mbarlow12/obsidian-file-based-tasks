import {EventRef, Events as ObsEvents} from 'obsidian';
import {EventType, TaskModifiedData} from "./types";
import {State} from "../Store/TaskStore";


export class TaskEvents {
    private _events: ObsEvents;

    /**
     * note: passing in Workspace for now
     * @param obsidianEvents
     */
    constructor(obsidianEvents: ObsEvents) {
        this._events = obsidianEvents;
    }

    public off(ref: EventRef) {
        this._events.offref(ref)
    }

    triggerIndexUpdate(data: TaskModifiedData) {
        this._events.trigger(EventType.INDEX_UPDATE, data)
    }

    registerIndexUpdateHandler(handler: (data: TaskModifiedData) => void) {
        return this._events.on(EventType.INDEX_UPDATE, handler);
    }

    onFileCacheUpdate(handler: (fileState: State) => void) {
        return this._events.on(EventType.FILE_CACHE_UPDATE, handler)
    }

    triggerFileCacheUpdate(fileState: State) {
        this._events.trigger(EventType.FILE_CACHE_UPDATE, fileState);
    }
}