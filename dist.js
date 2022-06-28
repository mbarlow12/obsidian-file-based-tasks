#!/usr/bin/env node

/* eslint-disable */
const fs = require('fs');
const path = require("path");
const os = require('os');

const config = require('./local.config');
const pwd = process.env.PWD;
const files = ['styles.css', 'manifest.json'];

const args = process.argv;
const { distDir } = process.argv.length > 2 && process.argv[2] === '--prod' ? config.prod : config.dev;
files.forEach(f => {
    const fp = path.resolve(pwd, f);
    fs.copyFile(fp, path.resolve(pwd, 'dist', f), err => {
        if (err) {
            console.error(`Failed to copy ${fp} into dist`);
        }
    });
});

fs.readdir(path.resolve(pwd, 'dist'), (err, files) => {
    if (err) {
        console.error(`Failed to read dist`);
        process.exit(1);
    }
    for (const file of files) {
        const distPath = path.resolve(pwd, 'dist', file);
        const pluginPath = path.resolve(distDir, file);
        fs.copyFile(distPath, pluginPath, err => {
            if (err) {
                console.error(`Failed to copy ${distPath} to ${pluginPath}`);
                process.exit(1);
            }
        });
    }
});
