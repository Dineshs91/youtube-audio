/////////////////////////////////////////// Decrypt signature ///////////////////////////////////////////

/*
Decrypt the signature, so that it can be used to get the manifest without hitting 403.
*/
function handle_decryption(msg) {
    console.log("Received message")
    var manifestUrl = msg.manifestUrl;
    var playerUrl = msg.playerUrl;
    var encryptedCode = msg.encryptedCode;

    $.get(playerUrl, function(playerSrcCode) {
        var sigFunction = get_function(playerSrcCode);
        var decryptSrcCode = find_decrypt_src_code(playerSrcCode, sigFunction);

        chrome.tabs.executeScript(null, {
            code: decryptSrcCode + sigFunction + "('" + encryptedCode + "')"
        }, function(result) {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
                chrome.tabs.sendMessage(tabs[0].id, {
                    manifestUrl: manifestUrl,
                    decryptedCode: result
                }, function() {});
            });
        });
    });
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

/////////////////////////////////////////// Listeners ///////////////////////////////////////////

/*
Listen for history changes. This is required since yt is an ajax site and to identify
the page navigation this is the only way to detect these changes.
*/
chrome.webNavigation.onHistoryStateUpdated.addListener(function(details) {
    var tabId = details.tabId;
    console.log(details);

    chrome.tabs.sendMessage(tabId, {"text": "start", "url": details.url}, function() {});
});

/*
Message listeners.
*/
chrome.runtime.onMessage.addListener(
    function(msg, sender, sendResponse) {
        if (msg.playerUrl) {
            // Decrypt the codes
            handle_decryption(msg);
        }
    }
)
