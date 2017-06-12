var dashMpds = [];

function send_message(tabId, msg) {
    chrome.tabs.sendMessage(tabId, msg, function() {});
}

/////////////////////////////////////////// Decrypt signature ///////////////////////////////////////////
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
Decrypt the signature, so that it can be used to get the manifest without getting 403.
*/
function get_decrypted_manifest_url(tabId, manifestUrl, playerUrl, encryptedCode) {
    var deferred = Q.defer();
    console.log("[youtube-audio] Received message")

    $.get(playerUrl, function(playerSrcCode) {
        var sigFunction = get_function(playerSrcCode);
        var decryptSrcCode = find_decrypt_src_code(playerSrcCode, sigFunction);

        chrome.tabs.executeScript(tabId, {
            code: decryptSrcCode + sigFunction + "('" + encryptedCode + "')"
        }, function(decryptedCode) {
            var decryptedManifestUrl = form_decrypted_manifest_url(manifestUrl, decryptedCode);
            deferred.resolve(decryptedManifestUrl);
        });
    }).fail(function(jqXHR, textStatus, errorThrown) {
        deferred.reject(errorThrown);
    });

    return deferred.promise;
}

/*
Get the decrypt src code (JS), which includes the decrypting function and its dependencies.
This code will be executed using chrome.tabs.executeScript.
*/
function find_decrypt_src_code(srcCode, sigFunction) {
    var regexStr = "(?:function\\s+" + sigFunction + "|[{;,]\\s*" + sigFunction + "\\s*=\\s*function|var\\s+" + sigFunction + "\\s*=\\s*function)\\s*\\(([^)]*)\\)\\s*\\{([^}]+)\\};";

    var pattern = new RegExp(regexStr);
    var mobj = pattern.exec(srcCode);

    var decryptSrcCode = "";
    if(mobj != null) {
        args = mobj[1];
        funcCode = mobj[2];
        var func = "var " + sigFunction + "=function(" + args + "){" + funcCode + "};";

        var pattern = new RegExp(/;(\w+)\.\w+\(\w+,\d+\);/);
        mobj = pattern.exec(funcCode);
        var depFuncName = mobj[1];

        var depFunc = get_dependent_function(srcCode, depFuncName);
        // Append the function to decryptSrcCode.
        decryptSrcCode += depFunc;
        decryptSrcCode += func;
    }

    return decryptSrcCode;
}

/*
Get the dependent functions of the decrypting function.
*/
function get_dependent_function(srcCode, depFuncName) {
    var pattern = new RegExp("var\\s+" + depFuncName + "={([^]+?)};");
    var mobj = pattern.exec(srcCode);

    var depFunc = ""
    if(mobj != null) {
        depFunc = "var " + depFuncName + "={" + mobj[1] + "};"
    }

    return depFunc;
}

/*
Get the function from base/player js file which will decrypt the signature.
*/
function get_function(srcCode) {
    var pattern = new RegExp(/([\"\'])signature\1\s*,\s*([a-zA-Z0-9$]+)\(/);
    var mobj = pattern.exec(srcCode);

    var sigFunction = null;
    if(mobj != null) {
        sigFunction = mobj[2];
    }

    return sigFunction;
}

/////////////////////////////////////////// start ///////////////////////////////////////////
/*
Get thumbnail for the video.
*/
function get_thumbnail(webpage) {
    var pattern = new RegExp(/<link itemprop="thumbnailUrl".*?href="(.*?)">/);
    var mobj = pattern.exec(webpage);
    var thumbnailUrl = "";

    if (mobj != null) {
        thumbnailUrl = mobj[1];
    }

    return thumbnailUrl;
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
Extract video info from the webpage.
*/
function get_video_info(videoId, webpage) {
    var deferred = Q.defer();
    var ytplayerConfig = get_ytplayer_config(webpage);
    var videoInfoUrl = "https://www.youtube.com/get_video_info/";

    var sts = null;
    var videoInfo = null;

    if (ytplayerConfig != null) {
        var args = ytplayerConfig['args'];

        if (args['url_encoded_fmt_stream_map'] != null || args['url_encoded_fmt_stream_map'] != undefined) {
            videoInfo = args;
            console.log("[youtube-audio] Obtained video info from ytplayer config ");
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
                'video_id': videoId,
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
Add dash mpd links to dashMpds array.
*/
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
Convert all manifest url's containing encrypted codes to url's with decrypted codes.
*/
function convert_to_decrypted_manifest_urls(tabId, playerUrl) {
    var deferred = Q.defer();
    var decryptedManifestPromises = [];

    for (var i = 0; i < dashMpds.length; i++) {
        var manifestUrl = dashMpds[i];
        var encryptedCode = get_encrypted_code_from_manifest(manifestUrl);

        decryptedManifestPromises.push(get_decrypted_manifest_url(tabId, manifestUrl, playerUrl, encryptedCode));
    }
    Q.all(decryptedManifestPromises).then(function(decryptedManifestUrls) {
        deferred.resolve(decryptedManifestUrls)
    }).catch(function(error) {
        deferred.reject(error);
    });

    return deferred.promise;
}

/*
This function tries to return atleast one successful dash manifest.
*/
function get_dash_manifest(decryptedDashManifests) {
    var deferred = Q.defer();
    var success = false;
    var j = 0;

    for (var i = 0; i < decryptedDashManifests.length; i++) {
        var manifestUrl = decryptedDashManifests[i];
        $.get(manifestUrl, function(data) {
            success = true;
            deferred.resolve(data);
        }).fail(function(jqXHR, textStatus, errorThrown) {
            j += 1;
            if (success == false && j == decryptedDashManifests.length - 1) {
                deferred.reject(errorThrown);    
            }
        });
    }

    return deferred.promise;
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

    console.log("[youtube-audio] Found [" + audioLinks.length + "] audio links");
    return audioLinks;
}

function start(tabId, msg) {
    // clear dashMpds array before starting.
    dashMpds = [];

    var webpage = msg.webpage;
    var videoId = msg.videoId;
    var baseJs = msg.baseJs;
    var playerUrl = "https://www.youtube.com" + baseJs;

    get_video_info(videoId, webpage).then(function(videoInfo) {
        add_dash_mpd(videoInfo);
        return convert_to_decrypted_manifest_urls(tabId, playerUrl);
    }).then(function(decryptedDashManifests) {
        return get_dash_manifest(decryptedDashManifests)
    }).then(function(dashManifest) {
        var jsonDoc = xml_parse(dashManifest);
        var audioLink = get_audio_links(jsonDoc)[0]['link'];
        var thumbnailUrl = get_thumbnail(webpage);

        var msg = {
            type: constant.audioFound,
            audioLink: audioLink,
            thumbnailUrl: thumbnailUrl
        }
        send_message(tabId, msg);
    }).catch(function(error) {
        console.log("Some error occurred: " + error);
    });
}

/////////////////////////////////////////// Listeners ///////////////////////////////////////////

/*
Listen for history changes. This is required since yt is an ajax site and to identify
the page navigation this is the only way to detect these changes.
*/
chrome.webNavigation.onHistoryStateUpdated.addListener(function(details) {
    var tabId = details.tabId;
    //console.log(details);

    msg = {
        type: constant.historyChange,
        url: details.url
    }

    chrome.tabs.sendMessage(tabId, msg, function() {});
});

/*
Message listeners.
*/
chrome.runtime.onMessage.addListener(
    function(msg, sender, sendResponse) {
        var tabId = sender.tab.id;

        if (msg.type === constant.videoFound) {
            // msg = {
            //     type: videoFound
            //     videoId: videoId,
            //     webpage: webpage,
            //     baseJs: baseJs
            // }

            start(tabId, msg);
        }
    }
)
