/**
 *
 */
import {Task, TaskList} from "./Task";
import {TFile, Vault} from "obsidian";

export class TaskManager {
    private tasks: Record<string, Task[]>; // id -> Task
    private backlogFileName: string;
    private completedFileName: string;
    private vault: Vault;
    private listeners: ((tasks: Task[]) => unknown)[];
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

    searchItems(needle: string): Task[] { return []; }

    registerEventHandlers() {}
    invokeListeners() {}
}