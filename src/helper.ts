import { App } from 'obsidian';
import TasksPlugin from './main';

export class AppHelper {
    private static _app: App;
    private static _plugin: TasksPlugin;
    private static _init = false;

    static init( a: App, p: TasksPlugin ) {
        this._plugin = p;
        this._app = a;
        this._init = true;
    }

    static get app() {
        return this.getter( this._app );
    }

    static get plugin() {
        return this.getter( this._plugin );
    }

    static get store() {
        return this.getter( this._plugin.store );
    }

    private static getter<T>( prop: T ): T | null {
        if ( !this._init )
            return null;
        return prop;
    }
}