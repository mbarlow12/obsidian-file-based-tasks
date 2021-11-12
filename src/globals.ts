import {App, FileManager, Vault} from "obsidian";

export interface Globals {
    app?: App;
    vault?: Vault;
    fileManager?: FileManager;
    initialized: boolean
}

const globals: Globals = {
    initialized: false
}

export default globals;
