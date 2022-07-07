import { CachedMetadata, TFile } from "obsidian";
import { TaskParser } from "../Parser/TaskParser";
import { TaskInstanceIndex } from '../Store/types';
import { taskLocationStr } from "../Task";

export const getFileInstanceIndex = ( file: TFile, cache: CachedMetadata, contents: string, parser = new TaskParser() ): TaskInstanceIndex => {
    const contentLines = contents.split( /\r?\n/ );

    return (cache.listItems || []).filter(li => li.task)
        .reduce((instIdx, lic) => {
            const task = parser.parseLine(contentLines[lic.position.start.line]);
            const locStr = taskLocationStr({filePath: file.path,  line: lic.position.start.line});
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