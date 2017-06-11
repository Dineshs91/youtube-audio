// dashMpds contains a collection of manifest urls.
// Accessing the manifest url gives an xml file, with the audio and video links in available formats.
var dashMpds = [];
var autoplayEnabled = false;
var enableObserver = false;
var observer;
var videoInfoUrl = "https://www.youtube.com/get_video_info/";

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
            }).fail(function(jqXHR, textStatus, errorThrown) {
                deferred.reject(errorThrown);
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
        var manifestUrl = dashMpds[i];
        $.get(manifestUrl, function(data) {
            deferred.resolve(data);
        }).fail(function(jqXHR, textStatus, errorThrown) {
            // Try to download the decrypted manifest.
            decrypt_manifest_signature(manifestUrl);
            deferred.reject(errorThrown);
        });
    }

    return deferred.promise;
}

/*
manifest.googlevideo.com/api/manifest/dash/source/youtube/s/9EF04C53DC3BA02F8622B1A2C7205EAF1DA5EB.E1F1766EF29E9AD8AA9D496D9FDF4EC298D620E/pl/24/.../requiressl/yes

/s/{encryptedCode}/
*/
function get_encrypted_code_from_manifest(manifestUrl) {
    var pattern = new RegExp(/\/s\/([a-fA-F0-9\.]+)/);
    var mobj = pattern.exec(manifestUrl);

    var encryptedCode = null;
    if (mobj != null) {
        encryptedCode = mobj[1];
    }

    return encryptedCode;
}

/*
Get the base.js file url from script element or the movie_player element.
*/
function get_base_js() {
    var baseJs = $("[name='player/base']").attr('src');
    if (baseJs == null || baseJs == undefined || baseJs === "" ) {
        baseJs = $("#movie_player").attr("data-version");
    }

    return baseJs;
}

/*
playerUrl: https://www.youtube.com/yts/jsbin/player-vflZ_L_3c/en_US/base.js
*/
function decrypt_manifest_signature(manifestUrl) {
    var playerUrl = "https://www.youtube.com" + get_base_js();
    var encryptedCode = get_encrypted_code_from_manifest(manifestUrl);
    console.log("Get decrypted manifest signature");

    // Handle in background script.
    chrome.runtime.sendMessage({
        manifestUrl: manifestUrl,
        playerUrl: playerUrl,
        encryptedCode: encryptedCode
    }, function() {});
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
    } else if(!(videoInfo == null || videoInfo == undefined) && !(videoInfo['thumbnail_url'] == null || videoInfo['thumbnail_url'] == undefined)) {
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
    $("#player-api").append("<div class='html5-video-player audiox'></div>");
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
        // $(this).find("source").attr("src", "");
        $(this).remove();
    });

    $("#player-api").find('img').remove();
}

/*
Remove youtube's video element. 
*/
function remove_video_elements() {
    console.log("Removing youtube video elements");

    // Copy the element before removing
    var videoPlayer = $("#movie_player");

    // pause the video before removing it.
    videoPlayer.find("video").trigger("pause");

    // remove the element.
    videoPlayer.remove();
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

function add_event_listeners() {
    // First unbind all the existing listeners
    $("#player-api").unbindArrive();
    $("#player-api").unbindLeave();

    // If our custom video element is removed by yt, we try to embed again.
    $('#player-api').leave("div", function() {
        if (enableObserver && $(this)[0].className == "html5-video-player audiox") {
            // console.log($(this)[0].className);
            if (! $(".html5-video-player.audiox").length) {
                console.log("Trying to embed again");
                start();
            }
        }
    });

    // Autoplay
    $(".audiox").on("ended", function() {
        console.log("Autoplay enabled: " + autoplayEnabled);
        if(autoplayEnabled) {
            play_next_audio();
        }

    });

    // pause the video and remove it first. (except for our video element.)
    $('#player-api').arrive("video", function() {
        if(enableObserver && $(this)[0].className != "html5-video-player audiox" ) {
            $(this).pause();
            $(this).remove();
        }
    });

    // Remove all the child nodes of player-api element except for our video element.
    // This is needed to remove any dynamic elements added by yt.
    $('#player-api').arrive("div", function() {
        if(enableObserver && $(this)[0].className != "html5-video-player audiox" ) {
            $(this).remove();
        }
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
    var audioLink;

    get_video_info(webpage).then(function(videoInfo) {
        console.log("Obtained video info");
        add_dash_mpd(videoInfo);
        thumbnailUrl = get_thumbnail(webpage, videoInfo);
        return get_dash_manifest();
    }).then(function(dashManifest) {
        console.log("Retreived dash manifest successfully");
        jsonDoc = xml_parse(dashManifest);
        audioLink = get_audio_links(jsonDoc)[0]['link'];

        if (audioLink != null || audioLink != undefined || audioLink != "") {
            enableObserver = true;
            remove_video_elements();
            embed_audio_to_webpage(audioLink, thumbnailUrl);

            autoplay_enabled();
        }
    }).catch(function(e) {
        enableObserver = false;
        console.log(e);
    }).fin(function() {
        console.log("Adding event listeners");
        add_event_listeners();
    });
}

/*
Replace /s/ADFEB.EBEB/ => /signature/EDADD.CDC/
*/
function form_decrypted_manifest_url(manifestUrl, decryptedCode) {
    var decryptedManifestUrl = null;
    var pattern = new RegExp(/\/s\/([a-fA-F0-9\.]+)\//);
    var value = "/signature/" + decryptedCode + "/"
    
    var decryptedManifestUrl = manifestUrl.replace(pattern, value);
    return decryptedManifestUrl;
}

/*
This manifest url should contain decrypted signatures.
*/
function fetch_decrypted_manifest(decryptedManifestUrl) {
    var deferred = Q.defer();

    $.get(decryptedManifestUrl, function(data) {
        deferred.resolve(data);
    }).fail(function(jqXHR, textStatus, errorThrown) {
        deferred.reject(errorThrown)
    });

    return deferred.promise;
}

/*
Handle decrypted manifest flow.
*/
function handle_decrypted_manifest(manifestUrl, decryptedCode) {
    console.log("handle decrypted manifest");
    var webpage = get_webpage();
    var audioLink = null;


    var thumbnailUrl = get_thumbnail(webpage);
    var decryptedManifestUrl = form_decrypted_manifest_url(manifestUrl, decryptedCode);
    fetch_decrypted_manifest(decryptedManifestUrl).then(function(dashManifest) {
        console.log("Retreived dash manifest successfully by decrypting");
        jsonDoc = xml_parse(dashManifest);
        audioLink = get_audio_links(jsonDoc)[0]['link'];

        if (audioLink != null || audioLink != undefined || audioLink != "") {
            enableObserver = true;
            remove_video_elements();
            embed_audio_to_webpage(audioLink, thumbnailUrl);

            autoplay_enabled();
        }
    }).catch(function(e) {
        enableObserver = false;
        console.log(e);
    }).fin(function() {
        console.log("Adding event listeners");
        add_event_listeners();
    });
}

/*
Listen to start message from background page. It gets triggered from chrome.webNavingation event.
*/
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    /* If the received message has the expected format... */
    if (msg.text && (msg.text == 'start')) {
        console.log('Received a msg from background page...');

        // check if element is present.
        if ($("#eow-title").length) {
            var v = getParameterByName("v", msg.url);

            if(get_video_id() == v) {
                start();
            }
        } else {
            $(document).arrive("#eow-title", function() {
                var v = getParameterByName("v", msg.url);
                if(get_video_id() == v) {
                    $(document).unbindArrive("#eow-title");
                    start();
                }
            });
        }
    } else if(msg.decryptedCode) {
        console.log("Received decrypted code");
        var decryptedCode = msg.decryptedCode[0];
        var manifestUrl = msg.manifestUrl;

        handle_decrypted_manifest(manifestUrl, decryptedCode);
    }
});
