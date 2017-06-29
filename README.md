# youtube-audio
Listen to audio on youtube.


![youtube-audio-screenshot](https://github.com/Dineshs91/youtube-audio/blob/master/youtube-audio-screenshot.png)


## Features
- Plays the best audio available.
- No ads.
- Youtube's autoplay works but with audio.

## Development
Fork this project. Navigate to chrome://extensions and enable developer mode in chrome. Drag and drop the directory you just 
cloned. That's it. Hack away.

## Caveats
This extension tries to play the audio. It it's not able to do so, then the actual video is played, hence no interference. 

## Motivation
Most of the times while working I listen to songs on youtube. But the bandwidth gets used for video.
I felt there was lot of bandwidth being wasted. Hence I decided to write this chrome extension.

This extension tries to get the audio and play it. If it is not able to do so, then the usual behaviour of youtube is 
restored. It honours the autoplay option as well (Which is one of my favourite functionality in youtube).

## Credits
This project would not have been possible without the awesome [youtube-dl](https://github.com/rg3/youtube-dl) project.
The code for extracting the audio is a direct port from this project.
