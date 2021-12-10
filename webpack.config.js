const path = require('path');

module.exports = {
    entry: './main.ts',
    output: {
        path: path.resolve(__dirname, 'dist'),
        libraryTarget: 'commonjs',
        filename: 'main.js',
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
            },
        ],
    },
    externals: {
        obsidian: 'obsidian',
    },
    resolve: {
        extensions: ['.js', '.ts'],
        fallback: {
            crypto: require.resolve('crypto-browserify'),
            path: require.resolve('path-browserify')
        }
    }
}