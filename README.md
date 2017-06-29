# youtube-audio
Turn youtube to an audio player. This is a chrome extension which converts youtube to play just the audio.


![youtube-audio-screenshot](https://github.com/Dineshs91/youtube-audio/blob/master/youtube-audio-screenshot.png)


## Features
- Plays the best audio available.
- No ads.
- Youtube's autoplay works but with audio.

## Options
Currently there are no options except for enable or disable from chrome://extensions. I would be open to see a PR which adds a
popup and some options there. Some options I could think of are option to choose the audio quality, enable/disable option.

## Development
Fork this project. Navigate to chrome://extensions and enable developer mode in chrome. Drag and drop the directory you just 
cloned. That's it. Hack away.

## Approach

_Content script_:
Downloads the webpage and sends it to background for further processing. Once background page sends back a message with the
audio link, youtube's video element is removed from the page and the custom video element (Which plays audio) is embedded
along with the thumbnail of the corresponding video.

_Background page_:
Takes care of downloading the manifest by decrypting signatures first. It chooses the best audio available and sends a message
to content script.

## Caveats
This extension tries to play the audio. It it's not able to do so, then the actual video is played, hence no interference.
The audio is loaded completely, before it is played. So if it is a long one, then it might take some time, before the audio
starts.

## Motivation
Most of the times while working I listen to songs on youtube. But the bandwidth gets used for video.
I felt there was lot of bandwidth being wasted. Hence I decided to write this chrome extension.

This extension tries to get the audio and play it. If it is not able to do so, then the usual behaviour of youtube is 
restored. It honours the autoplay option as well (Which is one of my favourite functionality in youtube).

## Credits
This project would not have been possible without the awesome [youtube-dl](https://github.com/rg3/youtube-dl) project.
The code for extracting the audio is a direct port from that project.
