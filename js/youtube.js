// dashMpds contains a collection of manifest urls.
// Accessing the manifest url gives an xml file, with the audio and video links in available formats.
var dashMpds = [];
var autoplayEnabled = false;
var enableObserver = false;
var observer;
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
        }).fail(function(jqXHR, textStatus, errorThrown) {
            deferred.reject(errorThrown);
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
Return audio/mp4 adaption set.
*/
function get_audio_adaption_set(adaptionSets) {
    for(var i = 0; i < adaptionSets.length; i++) {
        if(adaptionSets[i]['@attributes']['mimeType'] == "audio/mp4") {
            return adaptionSets[i];
        }
    }
}

/*
Return a list of all audio formats available.

TODO: Fetch all, currently fetches only the first one.
*/
function get_audio_links(jsonDoc) {
    var audioLinks = [];

    if (jsonDoc.hasOwnProperty('MPD')) {
        var adaptionSets = jsonDoc['MPD']['Period']['AdaptationSet'];
        var audioAdaptionSet = get_audio_adaption_set(adaptionSets);

        var audioRepresentations = audioAdaptionSet['Representation'];
        for(var i = 0; i < audioRepresentations.length; i++) {
            var audioRepresentation = audioRepresentations[i];
            audioLinks.push({
                "audioSamplingRate": audioRepresentation['@attributes']['audioSamplingRate'],
                "bandwidth": audioRepresentation['@attributes']['bandwidth'],
                "link": audioRepresentation['BaseURL']['#text']
            });
        }
    }

    console.log("Found [" + audioLinks.length + "] audio links");
    return audioLinks;
}

function get_thumbnail(webpage, videoInfo) {
    var pattern = new RegExp(/<link itemprop="thumbnailUrl".*?href="(.*?)">/);
    var mobj = pattern.exec(webpage);
    var thumbnailUrl = "";

    if (mobj != null) {
        thumbnailUrl = mobj[1];
    } else if(videoInfo['thumbnail_url'] != null || videoInfo['thumbnail_url'] != undefined) {
        thumbnailUrl = videoInfo['thumbnail_url'];
    }

    return thumbnailUrl;
}

function play_next_audio() {
    var nextAudioLink = $("#watch7-sidebar-modules .watch-sidebar-section").get(0);
    nextAudioLink = $(nextAudioLink).find(".watch-sidebar-body .content-link").get(0);

    if (nextAudioLink != null || nextAudioLink != undefined) {
        nextAudioLink.click();
        console.log("Playing next audio");
    } else {
        console.log("Unable to get the next audio.");
    }
}

function embed_audio_to_webpage(audioLink, thumbnailUrl) {
    console.log("Embedding custom video element");
    var videoElement = create_video_element(audioLink);
    $(".html5-video-player").prepend(videoElement);

    var thumbnail = $("<img src=" + thumbnailUrl + " style='width: 100%; height: 90%;'></img>");
    $("#player-api").prepend(thumbnail);

    $(".html5-video-player").css("height", "10%")
}

/*
Create and return a video element with the provided audio src.

<video controls autoplay name='media' class='audiox' style='width: 100%'>
    <source src='https://video-link' type='audio/mp4'></source>
</video>
*/
function create_video_element(audioSrc) {
    var videoElement = $("<video controls autoplay name='media' class='audiox' style='width: 100%; height: 100%;'></video>");
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
        $(this).trigger('pause');
        $(this).find("source").attr("src", "");
        $(this).remove();
    });

    $("#player-api").find('img').remove();
}

/*
Remove youtube's video element. 
*/
function remove_video_elements() {
    console.log("Removing youtube video elements");
    
    var playerApiElement = $('#player-api');
    var htm5VideoPlayerElement = $('.html5-video-player');
    var videoElement = $('video');

    var htlm5MainVideo = $('video.html5-main-video');

    // Pause the main video before removing it.
    if (htlm5MainVideo != null || htlm5MainVideo != undefined) {
        htlm5MainVideo.trigger('pause');
        htlm5MainVideo.remove();
    }

    if (playerApiElement != null || playerApiElement != undefined) {
        playerApiElement.empty().append(htm5VideoPlayerElement);
    }
    
    if (htm5VideoPlayerElement != null || htm5VideoPlayerElement != undefined) {
        htm5VideoPlayerElement.empty();
    }
    if (videoElement != null || videoElement != undefined) {
        videoElement.remove();
    }

    // There should be no child elements, other than our custom audio element.
    // We observe for any child nodes being added and remove them.
    if (enableObserver == true) {
        observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                node = mutation.addedNodes[0];
                if (node != undefined && node.className != "audiox" && enableObserver == true) {
                    node.remove();
                }
            });
        });

        var observerConfig = {
            childList: true
        };

        observer.observe(document.body.querySelector(".html5-video-player"), observerConfig);
        console.log("Added mutation observer for html5 video element");
    }

    // TODO: Disable observer when the plugin is disabled.
}

function autoplay_enabled() {
    var autoplayCheckbox = $("#autoplay-checkbox");
    // Get the initial value.
    autoplayEnabled = $(autoplayCheckbox).is(":checked");

    // Capture any changes made afterwards.
    $(autoplayCheckbox).change(function() {
        autoplayEnabled = $(this).is(":checked");
    });
}

function get_webpage() {
    return document.body.innerHTML;
}

function start() {
    // Clear any previous state.
    dashMpds = [];
    autoplayEnabled = false;
    enableObserver = false;

    remove_custom_video_elements();

    var videoId = get_video_id();

    if (videoId == null || videoId == undefined || videoId == "") {
        console.log("video id not found");
        return;
    } else {
        console.log("Found video id: " + videoId);
    }

    var webpage = get_webpage();
    var thumbnailUrl = "";
    
    get_video_info(webpage).then(function(videoInfo) {
        console.log("Obtained video info")
        add_dash_mpd(videoInfo);
        thumbnailUrl = get_thumbnail(webpage, videoInfo);
        return get_dash_manifest();
    }).then(function(dashManifest) {
        console.log("Retreived dash manifest successfully");
        jsonDoc = xml_parse(dashManifest);
        var audio_link = get_audio_links(jsonDoc)[0]['link'];

        if (audio_link != null || audio_link != undefined || audio_link != "") {
            enableObserver = true;
            remove_video_elements();
            remove_custom_video_elements();
            embed_audio_to_webpage(audio_link, thumbnailUrl);

            autoplay_enabled();

            $(".audiox").on("ended", function() {
                console.log("Autoplay enabled: " + autoplayEnabled);
                if(autoplayEnabled) {
                    play_next_audio();
                }

            });
        }
    }).catch(function(e) {
        enableObserver = false;
        remove_custom_video_elements();
        console.log(e);
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
        if(observer != null || observer != undefined) {
            observer.disconnect();
            console.log("Observer disconnected");
        } else {
            console.log("No Observer found");
        }
        remove_custom_video_elements();

        $(document).arrive("#eow-title", function() {
            console.log("Element detected");
            start();
        });
    }
});
