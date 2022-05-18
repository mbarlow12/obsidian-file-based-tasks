import { CachedMetadata, TFile } from "obsidian";
import { parseTaskString } from "../Parser";
import { InstanceIndex } from '../Store/types';
import { TaskInstance } from "../Task";

export const getFileTaskState = ( file: TFile, cache: CachedMetadata, contents: string ): InstanceIndex => {
    const contentLines = contents.split( /\r?\n/ );
    return {
        [ file.path ]: (cache.listItems || []).filter( li => li.task ).reduce( ( instances, lic ) =>
            [
                ...instances,
                {
                    ...parseTaskString( contentLines[ lic.position.start.line ] ),
                    filePath: file.path,
                    parent: lic.parent,
                    position: lic.position,
                }
            ], [] as TaskInstance[] )
    }
};