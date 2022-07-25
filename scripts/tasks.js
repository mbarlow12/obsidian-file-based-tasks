const rolloverTasks = async (
    src,
    app,
    startMatch,
    endMatch,
    recreateDone = false
) => {
    if (!src)
        return '';
    const { metadataCache, vault } = app;
    const cache = metadataCache.getFileCache( src );
    const data = (await vault.read( src )).split( '\n' );
    const start = Math.max( data.findIndex( l => l.toLowerCase().includes( startMatch ) ), 0 );
    let end = data.findIndex( line => line.toLowerCase().includes( endMatch ) );
    end = end === -1 ? data.length : end;
    const taskLines = (cache.listItems || [])
        .filter( li => li.task &&
                       (li.task.trim() === '' || recreateDone) &&
                       li.position.start.line >= start &&
                       li.position.start.line < end );
    const rolloverLines = taskLines.map( li => {
        const l = li.position.start.line;
        let line = data[ l ];
        if ( li.task.trim() === '' )
            data[l] = ''
        else {
            line = line.replace( /^(\s*[-*] \[)([^\s]+)(\])/, "$1 $3" )
                .replace( /\[\[.*\]\] \^[\w\d]+$/, '' )
                .trimEnd();
        }
        return line;
    } );
    cache.listItems.filter(li => li.task && li.task.trim() === '')
        .forEach(li => {
           data[li.position.start.line] = null;
        });
    await vault.modify( src, data.filter(l => l !== null).join( '\n' ) );
    return rolloverLines.join( '\n' );
}

const simpleReturn = (app) => {
    console.log(app);
    return 'hello';
    // const plugin = app.plugins.getPlugin('mb-task-manager');
    // const ts = plugin.store.getState().Task.items;
    // return ts.join(' ');
}

module.exports = () => ({
    rolloverTasks,
    simpleReturn
})