chrome.webNavigation.onHistoryStateUpdated.addListener(function(details) {
    var tabId = details.tabId;

    chrome.tabs.sendMessage(tabId, {"text": "start"}, function(response) { console.log(response) });
});