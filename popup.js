$(function() {
    // Handle enable checkbox input.
    $('.enable').on('click', function() {
        var enable = false;
        if ($(this).is(":checked")) {
            enable = true;
        }

        console.log("Printing the value of enable: " + enable);
        
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {enable: enable}, function(response) {
                console.log(response);
            });
        });
    });
});