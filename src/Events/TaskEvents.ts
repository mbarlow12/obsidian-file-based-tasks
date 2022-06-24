import { EventRef, Events as ObsEvents } from 'obsidian';
import { TaskStoreState } from '../Store/types';
import { TaskManagerSettings } from '../taskManagerSettings';
import { EventType, FileCacheUpdateHandler, IndexUpdateAction } from "./types";


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

    triggerRequestSettings() {
        this._events.trigger(EventType.REQUEST_SETTINGS_UPDATE)
    }

    onSettingsRequest(handler: () => void) {
        return this._events.on(EventType.REQUEST_SETTINGS_UPDATE, handler);
    }

    triggerSettingsUpdate(settings: TaskManagerSettings) {
        this._events.trigger(EventType.SETTINGS_UPDATE, settings);
    }

    onSettingsUpdate(handler: (settings: TaskManagerSettings) => void) {
        return this._events.on(EventType.SETTINGS_UPDATE, handler);
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

    triggerFileCacheUpdate(action: IndexUpdateAction) {
        this._events.trigger(EventType.FILE_CACHE_UPDATE, action);
    }
}