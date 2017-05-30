var dash_mpds = [];
var embedded_audio = false;
var video_info_url = "https://www.youtube.com/get_video_info/";

function extract_swf_player(webpage) {
    var pattern = new RegExp('/swfConfig.*?"(https?:\\/\\/.*?watch.*?-.*?\.swf)"/');
    var mobj = pattern.exec(webpage);

    var player_url = null;
    if (mobj != null) {
        var player_url_pattern = '\\(.)';
        player_url = str.replace(player_url_pattern, '\1', mobj[1]);
    }

    return player_url;
}

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

function get_video_id() {
    return getParameterByName('v');
}

function get_video_info(webpage) {
    var ytplayer_config = get_ytplayer_config(webpage);
    var video_info = null;
    var sts = null;

    if (ytplayer_config != null) {
        var args = ytplayer_config['args'];

        if (args['url_encoded_fmt_stream_map'] != null || args['url_encoded_fmt_stream_map'] != undefined) {
            video_info = args;
            add_dash_mpd(video_info);
            sts = ytplayer_config['sts'];
        }
    }
    if (video_info == null || dash_mpds.length == 0) {
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
            var xhr = new XMLHttpRequest();
            xhr.open("GET", video_info_url + formatParams(query), true);

            xhr.onreadystatechange = function() {
                qs = new QueryString(xhr.responseText);
                dash_mpd = qs.value("dashmpd");
                if (dash_mpd != null || dash_mpd != undefined) {
                    video_info = {"dashmpd": dash_mpd};
                    add_dash_mpd(video_info);
                    get_audio_links();
                }
            };

            xhr.send();

            if (video_info.hasOwnProperty("token")) {
                break;
            }
        }
    }
}

function get_audio_links() {
    for (var i = 0; i < dash_mpds.length; i++) {
        var xhr = new XMLHttpRequest();
        xhr.open("GET", dash_mpds[i], true);
        xhr.onreadystatechange = function() {
            xml_parse(xhr.responseText);
        }

        xhr.send();
        break;
    }
}

function add_dash_mpd(video_info) {
    var dash_mpd = video_info['dashmpd'];

    if (dash_mpd != null || dash_mpd != undefined) {
        if (dash_mpds[dash_mpd] == null || dash_mpds[dash_mpd] == undefined) {
            dash_mpds.push(dash_mpd);
        }
    }
}

function xml_parse(doc) {
    parser = new DOMParser();
    xmlDoc = parser.parseFromString(doc, "text/xml");

    jsonDoc = xmlToJson(xmlDoc);
    if (jsonDoc.hasOwnProperty('MPD') && embedded_audio == false) {
        audio_link = jsonDoc['MPD']['Period']['AdaptationSet'][0]['Representation'][0]['BaseURL']['#text'];

        var video_element = create_video_element(audio_link);
        $("#body-container").append(video_element);
        embedded_audio = true;
    }
}

/*
Create and return a video element with the provided audio src.

<video controls autoplay name="media">
    <source src="https://video-link" type="audio/mp4"></source>
</video>
*/
function create_video_element(audio_src) {
    var video_element = $("<video controls blah autoplay name='media'></video>");
    var source_element = $("<source src='" + audio_src + "' type='audio/mp4'></source>")

    video_element.append(source_element[0]);
    return video_element[0];
}

function remove_video_elements() {
    var html5_ele = document.body.querySelector('.html5-video-player');
    var player_id_ele = document.body.querySelector('#player-api');
    var player_class_ele = document.body.querySelector('.player-api');
    var video_ele = document.body.querySelector('video');
    
    if (html5_ele != null || html5_ele != undefined) {
        html5_ele.remove();    
    }
    if (player_id_ele != null || player_id_ele != undefined) {
       player_id_ele.remove();   
    }
    if (player_class_ele != null || player_class_ele != undefined) {
        player_class_ele.remove();
    }
    if (video_ele != null || video_ele != undefined) {
        video_ele.remove();
    }
    dash_mpds = [];
}

function get_webpage() {
    return document.body.innerHTML;
}

function start() {
    var webpage = get_webpage();
    console.log("start triggered:" + get_video_id());
    get_video_info(webpage);

    extract_swf_player(webpage);
}

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    /* If the received message has the expected format... */
    if (msg.text && (msg.text == 'start')) {
        console.log('Received a msg from background page...')
        embedded_audio = false;
        remove_video_elements();
        start();
    }
});