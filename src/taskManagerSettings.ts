import { ParserSettings } from './Parser/TaskParser';
import { FileManagerSettings } from './TaskFileManager';

export interface TaskManagerSettings {
    taskDirectoryName: string;
    taskTitlePrefix?: string;
    backlogFileName?: string;
    completedFileName?: string;
    taskPrefix?: string;
    parserSettings: ParserSettings;
    fileManagerSettings: FileManagerSettings;
}