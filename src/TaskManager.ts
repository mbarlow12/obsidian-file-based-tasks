/**
 *
 */
import {TFile, Vault} from "obsidian";
import {ITask, TaskList} from "./Task/types";

export class TaskManager {
    private tasks: Record<string, ITask[]>; // id -> Task
    private backlogFileName: string;
    private completedFileName: string;
    private vault: Vault;
    private listeners: ((tasks: ITask[]) => unknown)[];
    private taskDirectory?: string;

    constructor(backlogFileName?: string, completedFileName?: string) {
        this.backlogFileName = backlogFileName || 'Backlog.md';
        this.completedFileName = completedFileName || 'Completed.md';


    }

    async initialize() {
        const files: TFile[] = this.vault.getMarkdownFiles();
    }

    overrideChecklistToggle() {}

    onKeyupCallback(event: Event) {}

    completeItem(nameOrId: string): void {
    }

    createItem(name: string): void {
    }

    deleteItem(nameOrId: string): void {
    }

    moveItem(nameOrId: string, destination: string): void {
    }

    searchItems(needle: string): ITask[] { return []; }

    registerEventHandlers() {}
    invokeListeners() {}
}