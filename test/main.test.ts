import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { Plugin, TAbstractFile, TFile, TFolder } from "obsidian";

import TasksPlugin from '../src/main';
import { TestPluginInit } from './tests/init.test';
import { delay } from './Util.test';

chai.use(chaiAsPromised);

export interface TestRunConfig {
    template_content: string;
    target_content: string;
    wait_cache: boolean;
    skip_template_modify: boolean;
    skip_target_modify: boolean;
}

export default class TestTaskPlugin extends Plugin {
    tests: Array<{ name: string; fn: () => Promise<void> }>;
    plugin: TasksPlugin;
    activeFiles: TAbstractFile[] = [];

    async onload() {
        this.addCommand({
            id: "run-templater-tests",
            name: "Run Templater Tests",
            callback: async () => {
                await this.setup();
                await this.load_tests();
                await this.run_tests();
                await this.teardown();
            },
        });
    }

    async setup() {
        await delay(300);
        this.tests = []
        // @ts-ignore
        // this.plugin = this.app.plugins.getPlugin(PLUGIN_NAME);
    }

    async teardown() {
        await this.cleanupFiles();
    }

    async load_tests() {
        TestPluginInit(this);
    }

    test(name: string, fn: () => Promise<void>) {
        this.tests.push({ name, fn });
    }

    async run_tests() {
        for (const t of this.tests) {
            try {
                await t.fn();
                console.log("✅", t.name);
            } catch (e) {
                console.log("❌", t.name);
                console.error(e);
            }
        }
    }

    async cleanupFiles() {
        let file;
        while ((file = this.activeFiles.pop()) !== undefined) {
            try {
                await this.app.vault.delete(file, true);
            } catch (e) {}
        }
    }

    retrieveActiveFile(file_name: string): TAbstractFile {
        for (const file of this.activeFiles) {
            if (file.name === file_name) {
                return file;
            }
        }
        return null;
    }

    async createFolder(folder_name: string): Promise<TFolder> {
        let folder = this.retrieveActiveFile(folder_name);
        if (folder && folder instanceof TFolder) {
            return folder;
        }
        await this.app.vault.createFolder(folder_name);
        folder = this.app.vault.getAbstractFileByPath(folder_name);
        if (!(folder instanceof TFolder)) {
            return null;
        }
        this.activeFiles.push(folder);
        return folder;
    }

    async createFile(
        file_name: string,
        file_content = ""
    ): Promise<TFile> {
        const f = this.retrieveActiveFile(file_name);
        if (f && f instanceof TFile) {
            await this.app.vault.modify(f, file_content);
            return f;
        }
        const file = await this.app.vault.create(file_name, file_content);
        this.activeFiles.push(file);
        return file;
    }

    // async run_and_get_output(
    // ): Promise<string> {
    // }
}