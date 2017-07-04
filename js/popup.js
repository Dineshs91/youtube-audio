$(function() {
  chrome.storage.local.get('youtube_audio_enabled', function(data) {
    var enabled = data.youtube_audio_enabled;

    if(enabled == undefined || enabled == null) {
      enabled = true;
      update_storage('youtube_audio_enabled', enabled);
    }

    initialize_enable_checkbox(enabled);

    $(".enable").change(function() {
      var enabled = $(this).is(':checked');

      update_storage('youtube_audio_enabled', enabled);
    });
  });
});

function initialize_enable_checkbox(enabled) {
  $(".enable").prop('checked', enabled); 
}

function update_storage(key, value) {
  var obj = {};
  obj[key] = value;
  chrome.storage.local.set(obj);
}
