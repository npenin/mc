
exports.init = function (config, app)
{
    var EventEmitter = $('events').EventEmitter;

    $.prototype = EventEmitter.prototype;

    var io = $('socket.io').listen(global.server);

    io.configure('production', function ()
    {
        io.enable('browser client minification');  // send minified client
        io.enable('browser client etag');          // apply etag caching logic based on version number
        io.enable('browser client gzip');          // gzip the file
        io.set('log level', 1);                    // reduce logging    
    });

    exports.io = io;

    $.emit = function (event, message, callback)
    {
        io.sockets.emit(event, message, callback);
    };

};