import { PluginManifest, TFile } from 'obsidian';
import path from 'path';
import TasksPlugin from '../../src/main';
import TestTaskPlugin from '../main.test';
import { FILE_1_CONTENTS } from '../Util.test';


export const TestPluginInit = ( t: TestTaskPlugin ) => {
    t.test( 'single file init', async () => {
        const pluginPath = path.join(
            t.app.vault.getRoot().path,
            '.obsidian',
            'plugins',
            'mb-obsidian-tasks',
            'manifest.json'
        );
        const manifestFile = t.app.vault.getAbstractFileByPath( pluginPath ) as TFile;
        const manifestContents = await t.app.vault.read( manifestFile )
        const manifest: PluginManifest = JSON.parse( manifestContents );
        const plugin = new TasksPlugin( t.app, manifest );

        await t.createFile( 'file 1', FILE_1_CONTENTS );
        await plugin.initStore();
    } );
}