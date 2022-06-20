import { CachedMetadata, TFile } from "obsidian";
import { parseTaskString } from "../Parser";
import { TaskInstanceIndex } from '../Store/types';
import { taskLocationStr } from "../Task";

export const getFileInstanceIndex = ( file: TFile, cache: CachedMetadata, contents: string ): TaskInstanceIndex => {
    const contentLines = contents.split( /\r?\n/ );

    return (cache.listItems || []).filter(li => li.task)
        .reduce((instIdx, lic) => {
            const task = parseTaskString(contentLines[lic.position.start.line]);
            const locStr = taskLocationStr({filePath: file.path, position: lic.position, parent: lic.parent});
            return {
                ...instIdx,
                [ locStr ]: {
                    ...task,
                    primary: false,
                    filePath: file.path,
                    parent: lic.parent,
                    position: lic.position
                }
            }
        }, {} as TaskInstanceIndex)
};