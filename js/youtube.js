// Autoplay

var autoplay_enable_url = "https://www.youtube.com/gen_204?a=autoplay&state=enabled"

//
// dashMpds contains a collection of manifest urls.
// Accessing the manifest url gives an xml file, with the audio and video links in available formats.
var dashMpds = [];
var videoInfoUrl = "https://www.youtube.com/get_video_info/";

function extract_swf_player(webpage) {
    var pattern = new RegExp('/swfConfig.*?"(https?:\\/\\/.*?watch.*?-.*?\.swf)"/');
    var mobj = pattern.exec(webpage);

    var playerUrl = null;
    if (mobj != null) {
        var playerUrlPattern = '\\(.)';
        playerUrl = str.replace(playerUrlPattern, '\1', mobj[1]);
    }

    return playerUrl;
}

/*
Get ytplayer config from the webpage.
*/
function get_ytplayer_config(webpage) {
    patterns = [new RegExp(/;ytplayer\.config\s*=\s*({.+?});ytplayer/),
                new RegExp(/;ytplayer\.config\s*=\s*({.+?});/)];

    for (var i = 0; i < patterns.length; i++) {
        var pattern = patterns[i];
        var found = pattern.exec(webpage);

        if (found != null || found != undefined) {
            var ytplayer_config = found[1];
            return JSON.parse(ytplayer_config);
        }
    }
}

/*
Get the video id of the current page.
*/
function get_video_id() {
    return getParameterByName('v');
}

/*
Extract video info from the webpage.
*/
function get_video_info(webpage) {
    var deferred = Q.defer();
    var ytplayerConfig = get_ytplayer_config(webpage);
    var videoInfo = null;
    var sts = null;

    if (ytplayerConfig != null) {
        var args = ytplayerConfig['args'];

        if (args['url_encoded_fmt_stream_map'] != null || args['url_encoded_fmt_stream_map'] != undefined) {
            videoInfo = args;
            console.log("Obtained video info from ytplayer config ");
            add_dash_mpd(videoInfo);
            sts = ytplayerConfig['sts'];
            if(videoInfo != null && videoInfo['dashmpd'] != null) {
                deferred.resolve(videoInfo);    
            }
        }
    }
    if (videoInfo == null || dashMpds.length == 0) {
        var el_types = ["info", "embedded", "detailpage", "vevo", ""];

        for(var i = 0; i < el_types.length; i++) {
            var query = {
                'video_id': get_video_id(),
                'ps': 'default',
                'eurl': '',
                'gl': 'US',
                'hl': 'en',
            };
            var el = el_types[i];
            if (el != "") {
                query["el"] = el;
            }

            if (sts != null || sts != undefined || sts != "") {
                query["sts"] = sts;
            }

            // Get the video info.
            $.get(videoInfoUrl, query, function(data) {
                var qs = new QueryString(data);
                var dashMpd = qs.value("dashmpd");

                if (dashMpd != null || dashMpd != undefined) {
                    var videoInfo = {"dashmpd": dashMpd};
                    deferred.resolve(videoInfo);
                }
            });
        }
    }

    return deferred.promise;
}

/*
Get all the audio links from the array of dashMpds.
*/
function get_dash_manifest() {
    var deferred = Q.defer();

    for (var i = 0; i < dashMpds.length; i++) {
        $.get(dashMpds[i], function(data) {
            deferred.resolve(data);
        });
    }

    return deferred.promise;
}

function add_dash_mpd(videoInfo) {
    var dashMpd = videoInfo['dashmpd'];

    if (dashMpd != null || dashMpd != undefined) {
        var duplicateFound = false;
        for(var i = 0; i < dashMpds.length; i++) {
            if(dashMpds[i] == dashMpd) {
                duplicateFound = true;
                break;
            }
        }
        if (duplicateFound == false) {
            dashMpds.push(dashMpd);
        }
    }
}

/*
parse xml to json and return the object.
*/
function xml_parse(doc) {
    parser = new DOMParser();
    xmlDoc = parser.parseFromString(doc, "text/xml");

    jsonDoc = xmlToJson(xmlDoc);
    return jsonDoc;
}

/*
Return a list of all audio formats available.

TODO: Fetch all, currently fetches only the first one.
*/
function get_audio_link(jsonDoc) {
    if (jsonDoc.hasOwnProperty('MPD')) {
        audioLink = jsonDoc['MPD']['Period']['AdaptationSet'][0]['Representation'][0]['BaseURL']['#text'];
        return audioLink;
    }
}

function embed_audio_to_webpage(audioLink) {
    console.log("Embedding custom video element");
    var video_element = create_video_element(audioLink);
    $("#watch-header").prepend(video_element);
}

/*
Create and return a video element with the provided audio src.

<video controls autoplay name='media' class='audiox' style='width: 100%'>
    <source src='https://video-link' type='audio/mp4'></source>
</video>
*/
function create_video_element(audioSrc) {
    var videoElement = $("<video controls autoplay name='media' class='audiox' style='width: 100%'></video>");
    var sourceElement = $("<source src='" + audioSrc + "' type='audio/mp4'></source>")

    videoElement.append(sourceElement[0]);
    return videoElement[0];
}

/*
Remove the video elements inserted by us previously.
*/
function remove_custom_video_elements() {
    console.log("Removing custom video elements");
    $(".audiox").each(function() {
        $(this).remove();
    });
}

/*
Remove youtube's video element. 
*/
function remove_video_elements() {
    console.log("Removing youtube video elements");
    var html5Element = $('.html5-video-player');
    var playerIdElement = $('#player-api');
    var playerClassElement = $('.player-api');
    var videoElement = $('video');
    
    if (html5Element != null || html5Element != undefined) {
        html5Element.remove();    
    }
    if (playerIdElement != null || playerIdElement != undefined) {
       playerIdElement.remove();   
    }
    if (playerClassElement != null || playerClassElement != undefined) {
        playerClassElement.remove();
    }
    if (videoElement != null || videoElement != undefined) {
        videoElement.remove();
    }
}

function get_webpage() {
    return document.body.innerHTML;
}

function start() {
    // Clear dashMpds array.
    dashMpds = [];
    remove_custom_video_elements();

    var videoId = get_video_id();

    if (videoId == null || videoId == undefined || videoId == "") {
        console.log("video id not found");
        return;
    } else {
        console.log("Found video id: " + videoId);
    }

    var webpage = get_webpage();
    
    get_video_info(webpage).then(function(videoInfo) {
        console.log("Obtained video info")
        add_dash_mpd(videoInfo);
        return get_dash_manifest();
    }).then(function(dashManifest) {
        console.log("Retreived dash manifest successfully");
        jsonDoc = xml_parse(dashManifest);
        var audio_link = get_audio_link(jsonDoc);

        if (audio_link != null || audio_link != undefined || audio_link != "") {
            remove_video_elements();
        }

        embed_audio_to_webpage(audio_link);
    }).catch(function(e) {
        console.log("Error: " + e);
    });

    extract_swf_player(webpage);
}

// Initial start.
start();

/*
Listen to start message from background page. It gets triggered from chrome.webNavingation event.
*/
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    /* If the received message has the expected format... */
    if (msg.text && (msg.text == 'start')) {
        console.log('Received a msg from background page...')

        $(document).arrive("#eow-title", function() {
            console.log("Element detected");
            start();
        });
    }
});
