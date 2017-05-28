// https://stackoverflow.com/a/901144/2134124
function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

function get_video_id() {
    return getParameterByName('v');
}

function get_ytplayer_config(webpage) {
    patterns = [new RegExp(/;ytplayer\.config\s*=\s*({.+?});ytplayer/),
                new RegExp(/;ytplayer\.config\s*=\s*({.+?});/)];

    for (var i = 0; i < patterns.length; i++) {
        var pattern = patterns[i];
        var found = pattern.exec(webpage);

        if (found != null || found != undefined) {
            console.log("Found ytplayer config");
            var ytplayer_config = found[1];
            return JSON.parse(ytplayer_config);
        }
    }
}

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

function formatParams(params) {
  return "?" + Object
        .keys(params)
        .map(function(key) {
          return key+"="+encodeURIComponent(params[key])
        })
        .join("&")
}

function dexwwwfurlenc(urljson){
    var dstjson = {};
    var ret;
    var reg = /(?:^|&)(\w+)=(\w+)/g;
    while((ret = reg.exec(urljson)) !== null){
        dstjson[ret[1]] = ret[2];
    }
    return dstjson;
}

function QueryString(qs)
{
    this.dict= {};

    // If no query string  was passed in use the one from the current page
    if (!qs) qs= location.search;

    // Delete leading question mark, if there is one
    if (qs.charAt(0) == '?') qs= qs.substring(1);

    // Parse it
    var re= /([^=&]+)(=([^&]*))?/g;
    while (match= re.exec(qs))
    {
        var key= decodeURIComponent(match[1].replace(/\+/g,' '));
        var value= match[3] ? QueryString.decode(match[3]) : '';
        if (this.dict[key])
            this.dict[key].push(value);
        else
            this.dict[key]= [value];
    }
}

QueryString.decode= function(s)
{
    s= s.replace(/\+/g,' ');
    s= s.replace(/%([EF][0-9A-F])%([89AB][0-9A-F])%([89AB][0-9A-F])/gi,
        function(code,hex1,hex2,hex3)
        {
            var n1= parseInt(hex1,16)-0xE0;
            var n2= parseInt(hex2,16)-0x80;
            if (n1 == 0 && n2 < 32) return code;
            var n3= parseInt(hex3,16)-0x80;
            var n= (n1<<12) + (n2<<6) + n3;
            if (n > 0xFFFF) return code;
            return String.fromCharCode(n);
        });
    s= s.replace(/%([CD][0-9A-F])%([89AB][0-9A-F])/gi,
        function(code,hex1,hex2)
        {
            var n1= parseInt(hex1,16)-0xC0;
            if (n1 < 2) return code;
            var n2= parseInt(hex2,16)-0x80;
            return String.fromCharCode((n1<<6)+n2);
        });
    s= s.replace(/%([0-7][0-9A-F])/gi,
        function(code,hex)
        {
            return String.fromCharCode(parseInt(hex,16));
        });
    return s;
};

QueryString.prototype.value= function (key)
{
    var a= this.dict[key];
    return a ? a[a.length-1] : undefined;
};

QueryString.prototype.values= function (key)
{
    var a= this.dict[key];
    return a ? a : [];
};

QueryString.prototype.keys= function ()
{
    var a= [];
    for (var key in this.dict)
        a.push(key);
    return a;
};


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

            var xhr = new XMLHttpRequest();
            xhr.open("GET", "https://www.youtube.com/get_video_info/"+formatParams(query), true);

            xhr.onreadystatechange = function() {
                qs = new QueryString(xhr.responseText);
                dash_mpd = qs.value("dashmpd");
                if (dash_mpd != null || dash_mpd != undefined) {
                    video_info = {"dashmpd": dash_mpd};
                    add_dash_mpd(video_info);
                    get_audio();
                }
            };

            xhr.send();

            if (video_info.hasOwnProperty("token")) {
                console.log(dash_mpds);
                break;
            }
        }
    }
}

function get_audio() {
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

var dash_mpds = [];

function add_dash_mpd(video_info) {
    var dash_mpd = video_info['dashmpd'];

    if (dash_mpd != null || dash_mpd != undefined) {
        if (dash_mpds[dash_mpd] == null || dash_mpds[dash_mpd] == undefined) {
            dash_mpds.push(dash_mpd);
        }
    }
}

function get_webpage() {
    return document.body.innerHTML;
}

// Changes XML to JSON
// https://davidwalsh.name/convert-xml-json
function xmlToJson(xml) {
    
    // Create the return object
    var obj = {};

    if (xml.nodeType == 1) { // element
        // do attributes
        if (xml.attributes.length > 0) {
        obj["@attributes"] = {};
            for (var j = 0; j < xml.attributes.length; j++) {
                var attribute = xml.attributes.item(j);
                obj["@attributes"][attribute.nodeName] = attribute.nodeValue;
            }
        }
    } else if (xml.nodeType == 3) { // text
        obj = xml.nodeValue;
    }

    // do children
    if (xml.hasChildNodes()) {
        for(var i = 0; i < xml.childNodes.length; i++) {
            var item = xml.childNodes.item(i);
            var nodeName = item.nodeName;
            if (typeof(obj[nodeName]) == "undefined") {
                obj[nodeName] = xmlToJson(item);
            } else {
                if (typeof(obj[nodeName].push) == "undefined") {
                    var old = obj[nodeName];
                    obj[nodeName] = [];
                    obj[nodeName].push(old);
                }
                obj[nodeName].push(xmlToJson(item));
            }
        }
    }
    return obj;
};

function xml_parse(doc) {
    parser = new DOMParser();
    xmlDoc = parser.parseFromString(doc, "text/xml");

    jsonDoc = xmlToJson(xmlDoc);
    console.log("Get the audio link");
    if (jsonDoc.hasOwnProperty('MPD')) {
        audio_link = jsonDoc['MPD']['Period']['AdaptationSet'][0]['Representation'][0]['BaseURL']['#text'];
        console.log("audio_link---======>>>>>>");
        var html5_ele = document.body.querySelector('.html5-video-player');
        var player_id_ele = document.body.querySelector('#player-api');
        var player_class_ele = document.body.querySelector('.player-api');
        
        if (html5_ele != null || html5_ele != undefined) {
            html5_ele.remove();    
        }
        if (player_id_ele != null || player_id_ele != undefined) {
           player_id_ele.remove();   
        }
        if (player_class_ele != null || player_class_ele != undefined) {
            player_class_ele.remove();
        }

        console.log("Print this");
        video_element = document.createElement("video");
        source_element = document.createElement("source");
        source_element.src = audio_link;
        source_element.type = "audio/mp4";

        video_element.appendChild(source_element);

        console.log("Appending video to the document body");
        document.body.appendChild(video_element);
    }
}

(function() {
    var webpage = get_webpage();
    get_video_info(webpage);

    extract_swf_player(webpage);
})();
