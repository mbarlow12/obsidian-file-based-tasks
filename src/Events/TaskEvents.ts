import { EventRef, Events as ObsEvents } from 'obsidian';
import { State } from '../Store/types';
import { EventType, FileCacheUpdateHandler, IndexAction, TaskModifiedData } from "./types";


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

    triggerIndexUpdated(data: TaskModifiedData) {
        this._events.trigger(EventType.INDEX_UPDATED, data)
    }

    registerIndexUpdatedHandler(handler: (data: TaskModifiedData) => void) {
        return this._events.on(EventType.INDEX_UPDATED, handler);
    }

    onFileCacheUpdate(handler: FileCacheUpdateHandler) {
        return this._events.on(EventType.FILE_CACHE_UPDATE, handler)
    }

    triggerFileCacheUpdate(fileState: State, action: IndexAction) {
        this._events.trigger(EventType.FILE_CACHE_UPDATE, fileState, action);
    }
}