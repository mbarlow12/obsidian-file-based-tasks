import {MetadataCache, TFile, TFolder, Vault} from "obsidian";
import {
    fullTaskChecklist,
    getTaskFromYaml,
    ITask,
    ITaskTree,
    Task,
    TaskRecordType,
    taskToFileContents,
    TaskYamlObject
} from "./Task";
import {keys} from "ts-transformer-keys";
import {clone, pick} from 'lodash';
import TaskParser from "./Parser/TaskParser";
import {TaskIndex} from "./TaskIndex";
import {getFileTaskCache} from "./File";

type FileTreeNode = {
    name: string;
    children: FileTreeNode[]
}

export class TaskFileManager {
    private tasksDirString: string;
    private _tasksDirectory: TFolder;
    private vault: Vault;
    private mdCache: MetadataCache;

    constructor(vault: Vault, cache: MetadataCache, tasksDirectory: string = 'tasks') {
        this.vault = vault;
        this.mdCache = cache;
        this.tasksDirString = tasksDirectory;
        this._tasksDirectory = this.vault.getAbstractFileByPath(tasksDirectory) as TFolder;
    }

    public get tasksDirectory() {
        return this._tasksDirectory;
    }

    public set tasksDirectory(dir: TFolder) {
        this._tasksDirectory = dir;
    }

    public getTaskFile(name: string): TFile {
        if (name.endsWith('.md'))
            name = name.slice(0, name.length - 3);
        return this.mdCache.getFirstLinkpathDest(name, this._tasksDirectory.path);
    }

    // public saveTask(task: ITask) {
    //     // write this task to its dedicated task file
    //     // for each of its locations, write the task and children in anon form
    //     this.storeTaskFile(task)
    //         .then(() => this.writeTaskToLocations(task))
    // }

    public storeTaskFile(task: ITask) {
        const taskFile: TFile = this._tasksDirectory.children
            .filter(f => f.name === task.name)[0] as TFile;
        return this.vault.modify(taskFile, taskToFileContents(task))
    }

    public getAppConfig() {
        return (this.vault as any).config;
    }

    public isTaskFile(file: TFile): boolean {
        const cache = this.mdCache.getFileCache(file);
        return (
            file.path.contains(this.tasksDirString) &&
            cache.frontmatter && cache.frontmatter.type &&
            cache.frontmatter.type === TaskRecordType
        );
    }

    public async getTaskFromTaskFile(file: TFile): Promise<ITask> {
        const cache = this.mdCache.getFileCache(file);
        const taskYml: TaskYamlObject = pick(cache.frontmatter, ['id', 'name', 'locations', 'complete', 'created', 'updated', 'parents', 'children']);
        const task = getTaskFromYaml(taskYml);
        task.name = task.name ?? file.basename;
        const contentStart = cache.frontmatter.position.end.line + 1;
        const contents = await this.vault.read(file)
            .then(data => data.split('\n').slice(contentStart))
            .then(lines => lines.join('\n'));
        task.description = contents;
        return task;
    }

    private updateBacklog(allTasks: ITaskTree[]) {
        const seen: Set<number> = new Set();
        let task: ITaskTree;
        const contents: string[] = [];
        for (let i = 0; i < allTasks.length; i++) {
            task = allTasks[i];
            if (!task.complete && !(task.id in seen)) {
                contents.push(fullTaskChecklist(task))
                seen.add(task.id);
                const children = [...task.children];
                while (children.length) {
                    const nextChild = children.pop();
                    seen.add(nextChild.id);
                    children.push(...nextChild.children.filter(c => !seen.has(c.id)));
                }
            }
        }
        const backlog = this.vault.getMarkdownFiles().filter(f => f.name.startsWith('Backlog'))[0];
        this.vault.modify(backlog, contents.join('\n'))
            .then(() => {
                // backlog updated
            });
    }
}