chrome.webNavigation.onHistoryStateUpdated.addListener(function(details) {
    var tabId = details.tabId;
    console.log(details);

    chrome.tabs.sendMessage(tabId, {"text": "start", "url": details.url}, function(response) { console.log(response) });
});