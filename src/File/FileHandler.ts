import {TaskCacheItem} from "./types";
import {CachedMetadata, MetadataCache, TFile, Vault} from "obsidian";
import {DisplayTask} from "../Task";

export class FileHandlerFactory {
    private vault: Vault;
    private mdCache: MetadataCache;

    constructor(vault: Vault, mdCache: MetadataCache) {
        this.vault = vault;
        this.mdCache = mdCache;
    }

    public fileHandler(file: TFile) {
        return new FileHandler(file, this.mdCache.getFileCache(file));
    }
}

export class FileHandler {
    public taskCacheItems: TaskCacheItem[];
    private tasks: Record<string, DisplayTask>;
    private file: TFile;
    private vault: Vault;
    private metadata: CachedMetadata;

    constructor(file: TFile, metadata: CachedMetadata) {
        this.file = file;
        this.vault = file.vault;
        this.metadata = metadata;
    }
}