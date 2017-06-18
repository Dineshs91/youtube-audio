var autoplayEnabled = false;
var enableObserver = false;

/*
Get the video id of the current page.
*/
function get_video_id() {
    return getParameterByName('v');
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

function play_next_audio() {
    var nextAudioLink = $("#watch7-sidebar-modules .watch-sidebar-section").get(0);
    nextAudioLink = $(nextAudioLink).find(".watch-sidebar-body .content-link").get(0);

    if (nextAudioLink != null || nextAudioLink != undefined) {
        nextAudioLink.click();
        console.log("[youtube-audio] Playing next audio");
    } else {
        console.log("[youtube-audio] Unable to get the next audio.");
    }
}

function embed_audio_to_webpage(audioLink, thumbnailUrl) {
    remove_custom_video_elements();

    console.log("Number of video elements in this page." + $('video').length);

    $(document).find('video').each(function() {
        console.log("Trying to remove all video elements");
        console.log($(this));
        $(this).pause();
        $(this).remove();
    });

    console.log("[youtube-audio] Embedding custom video element");
    var videoElement = create_video_element(audioLink);
    $("#player-api").append("<div class='html5-video-player audio-div'></div>");
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
    console.log("[youtube-audio] Removing custom video elements");
    $(".audiox").each(function() {
        console.log($(this));
        $(this)[0].pause();
        $(this).remove();
    });

    $("#player-api").find('img').remove();
}

/*
Remove youtube's video element. 
*/
function remove_video_elements() {
    console.log("[youtube-audio] Removing youtube video elements");

    // Copy the element before removing
    var videoPlayer = $("#movie_player");

    // pause the video before removing it.
    var videoElement = videoPlayer.find("video")[0];
    if(videoElement != undefined || videoElement != null) {
        videoElement.pause();
    }

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
    unbind_event_listeners();

    // If our custom video element is removed by yt, we try to embed again.
    $('#player-api').leave("div", function() {
        if (enableObserver && $(this)[0].className == "html5-video-player audio-div") {
            if (! $(".html5-video-player.audio-div").length) {
                console.log("[youtube-audio] Trying to embed again");
                init();
            }
        }
    });

    // Autoplay
    $(".audiox").on("ended", function() {
        console.log("[youtube-audio] Autoplay enabled: " + autoplayEnabled);
        if(autoplayEnabled) {
            play_next_audio();
        }

    });

    // pause the video and remove it first. (except for our video element.)
    $(document).arrive("video", function() {
        if(enableObserver && $(this)[0].className != "audiox" ) {
            console.log($(this));
            $(this)[0].pause();
            $(this).remove();
        }
    });

    // Remove all the child nodes of player-api element except for our video element.
    // This is needed to remove any dynamic elements added by yt.
    $('#player-api').arrive("div", function() {
        if(enableObserver && $(this)[0].className != "html5-video-player audio-div" ) {
            var videoElement = $(this).find('video')[0];
            if(videoElement != undefined || videoElement != null) {
                videoElement.pause();
            }
            $(this).remove();
        }
    });
}

function unbind_event_listeners() {
    $(document).unbindArrive();
    $(document).unbindLeave();
}

function get_webpage() {
    return document.body.innerHTML;
}

function send_message(msg) {
    chrome.runtime.sendMessage(msg, function() {});
}

function handle_audio_found(msg) {
    var audioLink = msg.audioLink;
    var thumbnailUrl = msg.thumbnailUrl;

    if (audioLink != null || audioLink != undefined || audioLink != "") {
        enableObserver = true;
        remove_video_elements();
        embed_audio_to_webpage(audioLink, thumbnailUrl);

        autoplay_enabled();
    } else {
        enableObserver = false;
    }

    add_event_listeners();
}

function init() {
    var videoId = get_video_id();
    if (videoId != null || videoId != undefined || videoId === "") {
        console.log("[youtube-audio] found video:" + videoId);
        var webpage = get_webpage();
        var baseJs = get_base_js();

        var msg = {
            type: constant.videoFound,
            videoId: videoId,
            webpage: webpage,
            baseJs: baseJs
        }

        send_message(msg);
    }
}

//init();

/////////////////////////////////////////// Listeners ///////////////////////////////////////////

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if(msg.type == constant.audioFound) {
        // msg = {
        //     type: audioFound,
        //     audioLink: audioLink,
        //     thumbnailUrl: thumbnailUrl
        // };

        console.log("[youtube-audio] Found audio");
        handle_audio_found(msg);
    } else if(msg.type == constant.historyChange) {
        // msg = {
        //     type: historyChange,
        //     url: url
        // };

        console.log("[youtube-audio] history change: " + msg.url);
        var url = msg.url;
        var historyVideoId = null;
        if (url != null || url != undefined || url != "") {
            historyVideoId = getParameterByName('v', url);
        }

        var currentVideoId = get_video_id();

        if (currentVideoId === historyVideoId && !(currentVideoId == null || currentVideoId == undefined)) {
            console.log("[youtube-audio] calling init function:" + currentVideoId + ":" + historyVideoId);
            unbind_event_listeners();
            init();    
        }
    }
});