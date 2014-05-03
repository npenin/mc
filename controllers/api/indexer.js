module.exports = {
    post: function (body)
    {
        var episodeNumber = /(?:E(?:pisode)?)([0-9]+)/i;
        var seasonNumber = /(?:S(?:aison)?)([0-9]+)/i;
        var name = /(\w+\.)+/;
        this.send($.map(body, function (item)
        {
            if (item)
            {
                var season = seasonNumber.exec(item.name);
                var episode = episodeNumber.exec(item.name);
                return { path: item.path,
                    name: name.exec(item.name)[0].replace(/\./g, ' ').replace(/ $/, ''),
                    season: season && season[1],
                    episode: episode && episode[1] || /[0-9]+/.exec(item.name)[0]
                };
            }
        }));
    }
};