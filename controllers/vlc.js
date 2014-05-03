var vlc=false;

var debug=$('debug')('vlc');

if(!vlc)
{
	var libvlc=$('vlc');
	libvlc.LIBRARY_PATHS.push("C:\\Program Files (x86)\\VideoLAN\\VLC\\"+"libvlc.dll");
	debug('starting vlc');
	vlc=libvlc([ '--verbose', '1']);
	debug('vlc started');
}
		
process.on('exit', function(){
	if(vlc)
		vlc.kill();
});

function status()
{
	return { 
			input:
				{
					length:vlc.mediaplayer.length,
					position:vlc.mediaplayer.position,
					time:vlc.mediaplayer.time,
					state:vlc.mediaplayer.state
				},
			audio:
				{
					count:vlc.mediaplayer.audio.count,
					mute:vlc.mediaplayer.audio.mute,
					volume:vlc.mediaplayer.audio.volume,
					track:vlc.mediaplayer.audio.track,
					channel:vlc.mediaplayer.audio.channel
				},
			video:vlc.mediaplayer.video.description.length>0,
			mediaDescription: vlc.mediaplayer && (vlc.mediaplayer.media && indexedMedias[vlc.mediaplayer.media.instance.inspect()] || vlc.mediaplayer.media) || null,
		};
}

var socket = $;

var interval=false;

function emitStatus()
{
	if(vlc.mediaplayer.state!=3 && interval)
	{
		clearInterval(interval);
		interval=false;
	}
	socket.emit('player.status', status());
}

vlc.mediaplayer.on('Playing', function(newTime){
	emitStatus();
	interval=setInterval(emitStatus, 1000);
});
vlc.mediaplayer.on('Paused', function(newTime){
	emitStatus();
	if(interval)
		clearInterval(interval);
	interval=false;
});
vlc.mediaplayer.on('Stopped', function(newTime){
	emitStatus();
	if(interval)
		clearInterval(interval);
	interval=false;
});
vlc.mediaplayer.on('Forward', function(newTime){
	emitStatus();
});
vlc.mediaplayer.on('Backward', function(newTime){
	emitStatus();
});

var indexedMedias={};

commands =
{
    play: function (vid, indexedMedia)
    {
        if (typeof (vid) == 'undefined' || (!vid && vid!==0))
            commands.pause();
        else 
		{
			commands.stop();
			if(!isNaN(vid))
				vlc.playlist.playItem(vlc.playlist.playlist.at(vid));
			else
			{
				console.log(vid);
				var media = vlc.mediaFromFile(vid);
				media.parseSync();
				if(media.artworkURL===null)
					commands.artwork(media, indexedMedia);
				vlc.playlist.playItem(media);
				indexedMedias[media.instance.inspect()]=indexedMedia;
				commands.addToLastPlayed(vid, indexedMedia || {path:vid, name:media.title, artist:media.artist});
			}
		}
    },
	append: function(vid, indexedMedia)
	{
		var media = vlc.mediaFromFile(vid);
		media.parseSync();
		indexedMedias[media.instance.inspect()]=indexedMedia;
		vlc.playlist.playlist.add(media);		
	},
	addToLastPlayed:function(path, media)
	{
		$('fs').exists('./lastPlayed.json', function(exists){
			var lastPlayed=[];
			if(exists)
				lastPlayed=$('./lastPlayed.json');
			lastPlayed.push(media);
			if(lastPlayed.length>5)
				lastPlayed.splice(5,20);
			$('fs').writeFileSync('./lastPlayed.json', JSON.stringify(lastPlayed));
		});
	},
    mute: function ()
    {
        vlc.mediaplayer.audio.toggleMute();
    },
    fullscreen: function ()
    {
        vlc.mediaplayer.toggleFullscreen();
    },
    stop: function ()
    {
        vlc.playlist.stop();
    },
    pause: function ()
    {
        vlc.playlist.togglePause();
    },
	next:function(){
		vlc.playlist.next();
	},
	previous:function(){
		vlc.playlist.previous();
	},
    seek: function (time)
    {
        vlc.mediaplayer.time = time;
    },
	artwork: function(media, indexedMedia, callback)
	{
		if($.isFunction(media))
		{
			callback=media;
			media=false;
		}
		if(!media)
			media=vlc.mediaplayer.media;
		if(!indexedMedia)
			indexedMedia=indexedMedias[media.instance.inspect()];
		if(!indexedMedia)
		{
			indexedMedia=media;
			if(!media.video)
				indexedMedia.mediaType='music';
			else
				indexedMedia.mediaType='video';
		}
		
		console.log('looking for art');
		if(indexedMedia.mediaType=='music')
		{
			$.ajax({type:'get', dataType:'json', url:'http://mb.videolan.org/ws/2/release/?fmt=json&query=artist:%22'+media.artist+'%22%20AND%20release:%22'+media.album+'%22', success:function(data)
			{
				console.log('looked for art');
				if(data.count>0)
				{
					var matchingAlbums=$.grep(data.releases, function(item){
						return Number(item.score)==100 && item.asin && $.grep(item.media, function(media){ return media.format!='Digital Media' }).length>0;
					});
					
					if(matchingAlbums.length>0)
					{
						return (function(i){
							var func=arguments.callee;
							$.ajax({type:'get', dataType:'json', url:'http://mb.videolan.org/ws/2/release/'+matchingAlbums[i].id+'?fmt=json&inc=recordings', success:function(data){
								
								if(data.asin)
								{
									console.log('setting art');
									indexedMedia.artworkURL='http://images.amazon.com/images/P/'+data.asin+'.01._SCLZZZZZZZ_.jpg';
									console.log('set art to '+media.artworkURL);
									if(callback)
										callback();
								}
								else if(i<matchingAlbums.length-1)
									func(i++);
							}
							});	
						})(0);
					}
				}
				if(callback)
					callback();
			}, error:function(error){
				console.log('could not find art');
			}});
		}
		else if(indexedMedia.mediaType=='video')
		{
			var settings=
			{type:'post', dataType:'json', url:'http://192.168.68.11:5984/media/'+indexedMedia, success:function(data)
			{
				$.extend(indexedMedia, data);
			}, error: function(error)
			{
				
			}};

			$.getJSON('http://private-f864a-themoviedb.apiary-proxy.com/3/configuration?api_key=be3bc153ce74463263960789c93e29a9', function(config){
				if(indexedMedia.episode)
				{
					$.getJSON('http://private-f864a-themoviedb.apiary-proxy.com/3/search/tv?api_key=be3bc153ce74463263960789c93e29a9&query='+indexedMedia.name, function(results){
						if(results.total_results>0)
						{
							(function(i){
								var item=results.results[i];
								if(indexedMedia.season)
								{
									$.ajax('http://private-f864a-themoviedb.apiary-proxy.com/3/tv/'+item.id+'/season/'+indexedMedia.season+'?api_key=be3bc153ce74463263960789c93e29a9', {success:function(season){
										settings.url+=season.poster_path;
										settings.data=
										config.images.base_url+'original'+season.poster_path;
										console.log('set art to '+media.artworkURL);
										//media.saveSync();
									}, error:function(error){
										debug(JSON.stringify(error));
									}});
								}
								else
								{
									media.artworkURL=config.images.base_url+'original'+item.poster_path;
									console.log('set art to '+media.artworkURL);
									//media.saveSync();
								}
							})(0);
						}
					});
				}
				else
				{
					$.getJSON('http://private-f864a-themoviedb.apiary-proxy.com/3/search/movie?api_key=be3bc153ce74463263960789c93e29a9&query='+indexedMedia.name, function(results){
						if(results.total_results>0)
						{
							(function(i){
								var item=results.results[i];
								media.artworkURL=config.images.base_url+'original'+item.poster_path;
								console.log('set art to '+media.artworkURL);
								//media.saveSync();
							})(0);
						}
					});
				}
			});
		}
	}
};

module.exports = {
    index: function (mru)
    {
		var lastPlayed=$('./lastPlayed.json');
		var series=[];
		if($('fs').existsSync('./series.json'))
			series=$('./series.json');
        this.view('player', {mru:lastPlayed, series:series});
		if(!isNaN(mru))
			commands.play(lastPlayed[mru].path, lastPlayed[mru]);
    },
	playlist:function()
	{
		var medialist=[];
		for(var i =0; i<vlc.playlist.playlist.length; i++)
		{
			var media=vlc.playlist.playlist.at(i);
			var instance=media.instance;
			media=indexedMedias[media.instance.inspect()] || {path:media.path, name:media.title, artist:media.artist};
			console.log(instance.inspect());
			console.log(vlc.mediaplayer.media.instance.inspect());
			media.current=instance.inspect()===vlc.mediaplayer.media.instance.inspect();
			medialist.push(media);
		}
		this.send(200, medialist);
	},
	mute: function ()
    {
        commands.mute();
        return this.view('index', status());
    },
    fullscreen: function ()
    {
        commands.fullscreen();
        return this.view('index', status());
    },
	append:function(id)
	{
		var vid = id;
        var self = this;
        $.ajax({ type: 'get', dataType: 'json', url: 'http://192.168.68.11:5984/media/' + vid, success: function (media)
        {
            if (typeof (media) != 'undefined' && media)
            {
				if(media.error)
					commands.append(vid);
				else
				{
					var path=media.path.replace('[^A-Za-z0-9\\]+', function (match) { return encodeUriComponent(match) });
					path=path.replace(/\/?mnt\/HD\/HD_[ab]2\//, '\\\\stockage\\');
					$('fs').exists(path, function(exists){
						if(!exists)
						{
							console.log('Path not found :'+path);
							return;
							return $.ajax({type:'delete', dataType:'json', url:'http://192.168.68.11:5984/media/'+vid+'?rev='+media._rev, success:function()
							{
								return $.ajax({type:'get', dataType:'json', url:'http://192.168.68.11:5984/fulltext/_design/domojs/_view/reverse?include_docs=true&key='+encodeURIComponent('"'+vid+'"'), success:function(data){
									$.ajax({type:'post', dataType:'json', data:{docs:$.map(data.rows, function(item, index){ 
										item.doc.media[media.mediaType]=$.grep(item.doc.media[media.mediaType], function(m){ return m!=media._id });
										return item.doc;
									item.doc })}, url:'http://192.168.68.11:5984/fulltext/_bulk_docs', success:function(data){ console.log(data); }, error:function(data){ console.log(data); }});
								}});
							}});
						}
						commands.append(path, media);
						if(media.mediaType=='video')
						{
							$('fs').exists('./series.json', function(exists){
								var lastPlayed=[];
								if(exists)
									lastPlayed=$('./series.json');
								lastPlayed=$.grep(lastPlayed, function(item, index){
									return item.name!=media.name && item.season!=media.season;
								});
								if(!media.final)
									lastPlayed.push(media);
								$('fs').writeFileSync('./series.json', JSON.stringify(lastPlayed));
							});					
						}
					});
				}
            }
            else
                return self.send(500);

            return self.send(200);
		}});
	},
    play: function (id)
    {
        var vid = id;
        var self = this;
        $.ajax({ type: 'get', dataType: 'json', url: 'http://192.168.68.11:5984/media/' + vid, success: function (media)
        {
            if (typeof (media) != 'undefined' && media)
            {
				if(media.error)
					commands.play(vid);
				else
				{
					var path=media.path.replace('[^A-Za-z0-9\\]+', function (match) { return encodeUriComponent(match) });
					path=path.replace(/\/?mnt\/HD\/HD_[ab]2\//, '\\\\stockage\\');
					$('fs').exists(path, function(exists){
						if(!exists)
						{
							console.log('Path not found :'+path);
							return;
							return $.ajax({type:'delete', dataType:'json', url:'http://192.168.68.11:5984/media/'+vid+'?rev='+media._rev, success:function()
							{
								return $.ajax({type:'get', dataType:'json', url:'http://192.168.68.11:5984/fulltext/_design/domojs/_view/reverse?include_docs=true&key='+encodeURIComponent('"'+vid+'"'), success:function(data){
									$.ajax({type:'post', dataType:'json', data:{docs:$.map(data.rows, function(item, index){ 
										item.doc.media[media.mediaType]=$.grep(item.doc.media[media.mediaType], function(m){ return m!=media._id });
										return item.doc;
									item.doc })}, url:'http://192.168.68.11:5984/fulltext/_bulk_docs', success:function(data){ console.log(data); }, error:function(data){ console.log(data); }});
								}});
							}});
						}
						commands.play(path, media);
						if(media.mediaType=='video')
						{
							$('fs').exists('./series.json', function(exists){
								var lastPlayed=[];
								if(exists)
									lastPlayed=$('./series.json');
								lastPlayed=$.grep(lastPlayed, function(item, index){
									return item.name!=media.name && item.season!=media.season;
								});
								if(!media.final)
									lastPlayed.push(media);
								$('fs').writeFileSync('./series.json', JSON.stringify(lastPlayed));
							});					
						}
					});
				}
            }
            else
                commands.play();

            return self.send(status());
        }, error: function ()
        {
            commands.play(vid);
            return self.send(status());
        }
        });
    },
    stop: function ()
    {
        commands.stop();
        return this.view('index', status());
    },
    pause: function ()
    {
        commands.pause();
        return this.view('index', status());
    },	
	next:function(){
		commands.next();
        return this.view('index', status());
	},
	previous:function(){
		commands.previous();
        return this.view('index', status());
		
	},
    rseek: function (id)
    {
        return this.seek(vlc.mediaplayer.time + Number(id));
    },
    seek: function (id)
    {
        commands.seek(Number(id));
        return this.view('index', status());
    },
    volume: function (id)
    {
        vlc.mediaplayer.audio.volume = id;
        return this.view('index', status());
    },
    artwork: function (triedFetch)
    {
		var self=this;
		var callee=arguments.callee;
		if(vlc.mediaplayer.media.artworkURL!==null)
		{
			var artworkUrl=vlc.mediaplayer.media.artworkURL;
			if(artworkUrl.substring(0, 'file:///'.length)=='file:///')
			{
				artworkUrl=artworkUrl.substring('file:///'.length).replace(/\//g, '\\');
				var stream = $('fs').createReadStream(decodeURIComponent(artworkUrl));
				stream.pipe(this.response);
			}
			else
			{
				$.ajax(artworkUrl).on('response', function(response){ response.pipe(self.response); });
			}
		}
		else if(vlc.mediaplayer.media.artworkURL===null && !triedFetch)
			commands.artwork(function(){			
				callee.call(self, true);
			});
    },
    search: function (body, id)
    {
        var self = this;
        if (id)
        {
			$.ajax({ type: 'get', dataType: 'json', url: 'http://192.168.68.11:5984/fulltext/_design/domojs/_view/search?startkey=["' + id + '","' + body + '"]&endkey=["' + id + '","' + body + 'Z"]', success: function (data)
			{
				data = $.map(data.rows, function (el)
				{
					return el.value;
				});
				console.log(data);
				data = { keys: data };
				$.ajax({ type: 'post', dataType: 'json', headers: { 'Content-Type': 'application/json' }, data: data, url: 'http://192.168.68.11:5984/media/_all_docs?include_docs=true', success: function (data)
				{
					self.send(data);
				}
				});
			}, error: function ()
			{
				self.send(500);
			}
			});
        }
    },
	status: function()
	{
		if(vlc && vlc.mediaplayer && vlc.mediaplayer.media)
			this.send(status());
		else
			this.send(404);
	},
	hasNext: function(body)
	{
		console.log(body);
		var self=this;
		var query=JSON.stringify({keys:[[body.mediaType, body.name, body.season, body.episode+1]] });
		var searchedNewSeason=false;
		var settings=
		{type:'post', dataType:'json', data:query, url:'http://192.168.68.11:5984/media/_design/domojs/_view/ByName?reduce=false', success:function(data)
		{
			if(data.rows.length>0)
				self.send(data.rows[0]);
			else if(!searchedNewSeason && body.season)
			{
				settings.data=JSON.stringify({keys:[[body.mediaType, body.name, body.season+1, 1]] });
				searchedNewSeason=true;
				$.ajax(settings);
			}
			else
			{
				self.send(404);
			}
		}, error: function(error)
		{
			self.send(error);
		}};
		$.ajax(settings);
	},
	mru:function(){
		var series=[];
		if($('fs').existsSync('./series.json'))
			series=$('./series.json');
		return this.send(series);
	},
	player: function(){
		return this.view('player');
	},
	library:function(id, draw,length, start){
		debug('library '+id+' LIMIT '+start+','+length);
		var self=this;
		switch(id)
		{
			case 'ByName':
			default:
				$.getJSON('http://192.168.68.11:5984/media/_design/domojs/_view/'+id+'?reduce=false&limit='+length+'&skip='+start, function(result){
				self.send({
					draw:draw,
					recordsTotal:result.total_rows,
					recordsFiltered:result.total_rows,
					data:$.map(result.rows, function(item){ return {title:item.value.name, track:item.value.track, artist:item.value.artist, album:item.value.album, id:item.value._id}})
				});
			});
		}
	}
};