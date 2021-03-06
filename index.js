var axios = require('axios')
var fs = require('fs');
var _ = require('lodash');
let Parser = require('rss-parser');
let parser = new Parser();
var moment = require('moment')
var sanitize = require("sanitize-filename");

var config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
console.log("config: " + JSON.stringify(config));

var feeds = []
var dirPath = 'feeds'
fs.readdir(dirPath, function (err, files) {
    //listing all files using forEach
    files.forEach(function (file) {
        console.log(file); 

        var content = fs.readFileSync(`${dirPath}/${file}`, 'utf8');
        var feedJson = JSON.parse(content);
        feeds = feeds.concat(feedJson["sources-rss"]);
    });

    pollFeed();
});

var latestDir = 'latest';
!fs.existsSync(latestDir) && fs.mkdirSync(latestDir);

function pollFeed() {
    try {
        const hook = config["hook"];
        _.forEach(feeds, function(source) {
            (async () => {
                let feed = await parser.parseURL(source.url);
                console.log(feed.title);

                if(feed.title == undefined) {
                    return;
                }

                var latest = {};
                let latestFile = `./${latestDir}/${sanitize(feed.title)}.json`;
                try {
                    latest = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
                }
                catch(err) {
                    console.log(`${latestFile} not found.`);
                }        

                var latestTime = latest['Time'];
                if( latestTime == undefined) {
                    latestTime = moment().subtract(1, 'week');
                }
                else {
                    latestTime = moment(latestTime);
                }

                var nextLatestTime = latestTime;

                var messages = []
                feed.items.forEach(item => {
                    // console.log(item.title + ':' + item.link)
                    try {
                        if( _.isNil(item.pubDate)) {
                            return false;
                        }
                        
                        var pubDate = moment(item.pubDate);
                        if(!latestTime.isBefore(pubDate)) {
                            return false;
                        }
    
                        if(moment().isBefore(pubDate)) {
                            return false;
                        }
    
                        if(nextLatestTime.isBefore(pubDate)) {
                            nextLatestTime = pubDate;
                        }
    
                        messages.push(item.link.includes('https://') || item.link.includes('http://') ?
                            `<${item.link}'|${item.title}> [${pubDate.format('YYYY-MM-DD HH:mm')}]` :
                            `<${feed.link}${item.link}'|${item.title}> [${pubDate.format('YYYY-MM-DD HH:mm')}]`);
                    }
                    catch(e) {
                        console.error(e);
                    }
                });

                latest['Time'] = nextLatestTime;
                fs.writeFileSync(latestFile, JSON.stringify(latest));

                
                if(messages.length <= 0) {
                    return;
                }

                var check = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
                const checkKorean = (element) => check.test(element);

                axios.post(hook.hook_url, 
                    {
                        "text": messages.join("\n"), 
                        "username": feed.title, 
                        "icon_url": hook.icon_url, 
                        "channel": messages.some(checkKorean) ? hook.channel : hook.channel_eng
                    })
                    .then((result) => {
                        console.log(result);
                    });
            })();
        });
    }
    catch(e) {
        console.error(e);
    }
    finally {
        setTimeout(pollFeed, 3 * 60 * 1000);
    }
}

// 처음 한번은 바로 실행
pollFeed();