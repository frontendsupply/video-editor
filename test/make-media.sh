#!/bin/zsh
# Makes the stress-test media in test/media (git-ignored): everyday, odd, broken and long files, and 60 small clips.
# Run from the repo root: test/make-media.sh
set -e
mkdir -p test/media && cd test/media
F() { ffmpeg -v error -y "$@" }
src() { echo "-f lavfi -i testsrc2=size=${1}:rate=${2}:duration=${3}" }
tone() { echo "-f lavfi -i sine=frequency=${1}:sample_rate=${3:-48000}:duration=${2}" }
# everyday files
F $(src 1280x720 30 8) $(tone 440 8) -c:v libx264 -preset veryfast -c:a aac -shortest h264-bframes.mp4
F $(src 1920x1080 60 6) $(tone 330 6) -c:v libx264 -preset veryfast -bf 0 -c:a aac -shortest h264-60fps-nob.mp4
F $(src 3840x2160 30 6) $(tone 220 6) -c:v libx264 -preset ultrafast -c:a aac -shortest 4k.mp4
F $(src 1920x1080 120 4) -c:v libx264 -preset ultrafast hfr-120fps-silent.mp4
F $(src 642x362 25 5) $(tone 550 5 44100) -c:v libx264 -preset veryfast -c:a aac -shortest odd-642x362-25fps.mp4
F $(src 64x64 30 3) -c:v libx264 -preset veryfast tiny-64x64.mp4
F $(src 1280x720 30 0.034) -frames:v 1 -c:v libx264 one-frame.mp4
F $(src 1080x1920 30 5) $(tone 660 5) -c:v libx264 -preset veryfast -c:a aac -shortest portrait.mp4
F -display_rotation 90 -i portrait.mp4 -c copy rotated-90.mp4 2>/dev/null || F -i portrait.mp4 -c copy -metadata:s:v rotate=90 rotated-90.mp4
# variable frame rate: 30 fps, then 10 fps
F $(src 1280x720 30 3) -c:v libx264 -preset veryfast a30.mp4
F $(src 1280x720 10 3) -c:v libx264 -preset veryfast b10.mp4
printf "file 'a30.mp4'\nfile 'b10.mp4'\n" > list.txt && F -f concat -safe 0 -i list.txt -c copy vfr.mp4 && rm a30.mp4 b10.mp4 list.txt
# other codecs and containers
F $(src 1280x720 30 5) $(tone 440 5) -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -c:a libopus -shortest vp9-opus.webm
F $(src 1280x720 30 4) $(tone 440 4) -c:v libsvtav1 -preset 12 -c:a aac -shortest av1.mp4
F $(src 1280x720 30 4) $(tone 440 4) -c:v libx265 -preset ultrafast -tag:v hvc1 -c:a aac -shortest hevc.mp4
F $(src 1280x720 30 4) $(tone 440 4) -c:v libx265 -preset ultrafast -pix_fmt yuv420p10le -tag:v hvc1 -c:a aac -shortest hevc-10bit.mp4
F $(src 1280x720 30 3) $(tone 440 3) -c:v prores_ks -profile:v 2 -c:a pcm_s24le -shortest prores.mov
F $(src 720x576 25 4) $(tone 440 4) -c:v mpeg2video -q:v 4 -c:a mp2 -shortest mpeg2.mpg 2>/dev/null || F $(src 720x576 25 4) $(tone 440 4) -c:v mpeg2video -q:v 4 -c:a ac3 -shortest mpeg2.mpg
F $(src 640x480 25 4) $(tone 440 4) -c:v mpeg4 -q:v 4 -c:a libmp3lame -shortest xvid.avi
F $(src 1280x720 30 4) $(tone 440 4) -c:v libx264 -preset veryfast -c:a ac3 -shortest h264-ac3.mkv
F $(src 1280x720 30 4) $(tone 440 4) -c:v libx264 -preset veryfast -c:a aac -shortest h264-aac.mkv
# sound only
F $(tone 440 6) -ac 1 -c:a libmp3lame mono.mp3
F $(tone 440 6 44100) -c:a flac tone.flac
F $(tone 440 6) -c:a libopus tone.opus
F $(tone 440 6 96000) -c:a pcm_s24le hires-96k.wav
F $(tone 440 6 8000) -c:a pcm_s16le phone-8k.wav
F -f lavfi -i "sine=frequency=300:duration=6,aformat=channel_layouts=5.1" -c:a aac surround-51.m4a 2>/dev/null || F $(tone 300 6) -ac 6 -c:a aac surround-51.m4a
# broken and not-media
F $(src 1280x720 30 6) $(tone 440 6) -c:v libx264 -preset veryfast -c:a aac -shortest whole.mp4 && head -c $(( $(stat -f%z whole.mp4) / 2 )) whole.mp4 > truncated.mp4 && rm whole.mp4
: > empty.mp4
echo "not a video" > notes.mp4
F $(src 640x360 1 1) -frames:v 1 still.jpg
# many small files
mkdir -p many && for i in $(seq -w 1 60); do F $(src 320x180 30 2) $(tone $((200 + i * 10)) 2) -c:v libx264 -preset ultrafast -c:a aac -shortest many/clip-$i.mp4; done
# two hours, for long imports and exports (about 490 MB)
F $(src 320x180 30 7200) $(tone 440 7200) -c:v libx264 -preset ultrafast -crf 30 -g 60 -c:a aac -b:a 64k -shortest long-2h.mp4
echo "just text" > notes.txt
echo done
