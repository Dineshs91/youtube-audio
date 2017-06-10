chrome.webNavigation.onHistoryStateUpdated.addListener(function(details) {
    var tabId = details.tabId;
    console.log(details);

    chrome.tabs.sendMessage(tabId, {"text": "start", "url": details.url}, function() {});
});

chrome.runtime.onMessage.addListener(
    function(msg, sender, sendResponse) {
        // This will take the function, and the code to be decrypted.
        if (msg.playerUrl) {
            var playerUrl = msg.playerUrl;
            var encryptedCode = msg.encryptedCode;

            $.get(playerUrl, function(playerSrcCode) {
                var sigFunction = get_function(playerSrcCode);
                var decryptSrcCode = find_decrypt_src_code(playerSrcCode, sigFunction);

                chrome.tabs.executeScript(null, {
                    code: decryptSrcCode + sigFunction + "('" + encryptedCode + "')"
                }, function(result) {
                    console.log(result);
                    chrome.tabs.query({active: true, currentWindow: true}, function(tabs){
                        chrome.tabs.sendMessage(tabs[0].id, {
                            decryptedCode: result
                        }, function() {});
                    });
                });
            });
        }
    }
)

function find_decrypt_src_code(srcCode, sigFunction) {
    console.log("sigFunction is:" + sigFunction);
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

        //console.log(depFuncName);
        var depFunc = get_dependent_function(srcCode, depFuncName);
        // Append the function to decryptSrcCode.
        decryptSrcCode += depFunc;
        decryptSrcCode += func;
    }

    return decryptSrcCode;
}

function get_dependent_function(srcCode, depFuncName) {
    var pattern = new RegExp("var\\s+" + depFuncName + "={([^]+?)};");
    var mobj = pattern.exec(srcCode);

    var depFunc = ""
    if(mobj != null) {
        depFunc = "var " + depFuncName + "={" + mobj[1] + "};"
    }

    return depFunc;
}

function get_function(srcCode) {
    var pattern = new RegExp(/([\"\'])signature\1\s*,\s*([a-zA-Z0-9$]+)\(/);
    var mobj = pattern.exec(srcCode);

    var sigFunction = null;
    if(mobj != null) {
        sigFunction = mobj[2];
    }

    return sigFunction;
}
