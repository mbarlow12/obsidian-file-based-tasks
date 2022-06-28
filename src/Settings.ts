import { DEFAULT_PARSER_SETTINGS } from './Parser/TaskParser';
import { DEFAULT_FILE_MANAGER_SETTINGS } from './TaskFileManager';
import { Operator, TaskManagerSettings } from './taskManagerSettings';

export const DEFAULT_TASK_MANAGER_SETTINGS: TaskManagerSettings = {
    taskDirectoryName: 'tasks',
    backlogFileName: 'Backlog.md',
    completedFileName: 'Complete.md',
    taskPrefix: '#task',
    parserSettings: DEFAULT_PARSER_SETTINGS,
    fileManagerSettings: DEFAULT_FILE_MANAGER_SETTINGS,
    ignoredPaths: ['daily', 'templates'],
    indexFiles: new Map( [
        [
            'Backlog.md',
            {
                field: 'complete',
                op: Operator.EQ,
                value: false
            }
        ],
        [
            'Complete.md',
            {
                field: 'complete',
                op: Operator.EQ,
                value: true
            }
        ]
    ] )
}