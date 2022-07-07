import { FileManagerSettings, RenderOpts } from './File/TaskFileManager';
import { ParserSettings } from './Parser/TaskParser';
import { Operator, TaskManagerSettings } from './taskManagerSettings';

export const DEFAULT_PARSER_SETTINGS: ParserSettings = {
    tokens: {
        tag: '#',
        recurrence: '&',
        dueDate: '@',
        divider: '|*|'
    },
    prefix: ''
};
export const DEFAULT_FILE_MANAGER_SETTINGS: FileManagerSettings = {
    taskDirectoryName: 'tasks',
    backlogFileName: 'Backlog.md',
    completedFileName: 'Complete.md'
}
export const DEFAULT_TASK_MANAGER_SETTINGS: TaskManagerSettings = {
    taskDirectoryName: 'tasks',
    backlogFileName: 'Backlog.md',
    completedFileName: 'Complete.md',
    taskPrefix: '#task',
    parserSettings: DEFAULT_PARSER_SETTINGS,
    fileManagerSettings: DEFAULT_FILE_MANAGER_SETTINGS,
    ignoredPaths: ['templates'],
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
export const DEFAULT_RENDER_OPTS: RenderOpts = {
    id: true,
    links: false,
    tags: true,
    recurrence: true,
    dueDate: true,
    completedDate: true,
    strikeThroughOnComplete: false
};