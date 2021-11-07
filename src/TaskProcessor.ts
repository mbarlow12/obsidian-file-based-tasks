import {CachedMetadata, MetadataCache, TFile, TFolder, Vault} from "obsidian";
import {LocatedTask, Task, TaskRecordType} from "./Task";


export class TaskProcessor {
    private tasksDir: TFolder;
    private mdCache: MetadataCache;
    private vault: Vault;


    /**
     * We don't know what file this is.
     * @param tFile
     */
    async processFile(tFile: TFile): Promise<Task|Array<LocatedTask>> {
        const contents = await this.vault.cachedRead(tFile);
        const cache = this.mdCache.getFileCache(tFile);
        if (cache.frontmatter && cache.frontmatter.type === TaskRecordType) {
            // task file
        }
        else {
            // other file
        }
    }

    processTaskFile(contents: string, {frontmatter, links, listItems}: CachedMetadata) {
    }
}