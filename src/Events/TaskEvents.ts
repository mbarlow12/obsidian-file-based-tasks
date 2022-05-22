import { EventRef, Events as ObsEvents } from 'obsidian';
import { TaskInstanceIndex, TaskStoreState } from '../Store/types';
import { ActionType, EventType, FileCacheUpdateHandler } from "./types";


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

    triggerIndexUpdated(data: TaskStoreState) {
        this._events.trigger(EventType.INDEX_UPDATED, data)
    }

    registerIndexUpdatedHandler(handler: (data: TaskStoreState) => void) {
        return this._events.on(EventType.INDEX_UPDATED, handler);
    }

    onFileCacheUpdate(handler: FileCacheUpdateHandler) {
        return this._events.on(EventType.FILE_CACHE_UPDATE, handler)
    }

    triggerFileCacheUpdate(fileState: TaskInstanceIndex, action: ActionType) {
        this._events.trigger(EventType.FILE_CACHE_UPDATE, fileState, action);
    }
}