#!/usr/bin/env node

/* eslint-disable */
const fs = require( 'fs' );
const path = require( "path" );
const os = require( 'os' );

const config = require( './local.config' );
const pwd = process.env.PWD;
const files = [ 'styles.css', 'manifest.json' ];

const distConfig = process.argv.length > 2 && process.argv[ 2 ] === '--prod' ? config.prod : config.dev;
const srcDirs = Object.keys( distConfig.dirs );

files.forEach( f => {
    const fp = path.resolve( pwd, f );
    fs.copyFile( fp, path.resolve( pwd, 'dist', f ), err => {
        if ( err ) {
            console.error( `Failed to copy ${fp} into dist` );
        }
    } );
} );

srcDirs.forEach( srcDir => fs.readdir( path.resolve( pwd, srcDir ), ( err, files ) => {
    if ( err ) {
        console.error( `Failed to read ${srcDir}` );
        process.exit( 1 );
    }
    for ( const file of files ) {
        const distPath = path.resolve( pwd, srcDir, file );
        const pluginPath = path.resolve( distConfig.dirs[srcDir], file );
        fs.copyFile( distPath, pluginPath, err => {
            if ( err ) {
                console.error( `Failed to copy ${distPath} to ${pluginPath}` );
                process.exit( 1 );
            }
        } );
    }
} ) );
