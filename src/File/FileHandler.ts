import {TaskCacheItems} from "./types";
import {TFile} from "obsidian";
import {AnonymousDisplayTask} from "../Task";

export class FileHandler {
    public taskCacheItems: TaskCacheItems;
    private tasks: Record<string, AnonymousDisplayTask>;
    private contents: Array<string>;

    constructor(lines: string) {
        this.contents = lines.split(/(\r|\n)/g);

    }
}