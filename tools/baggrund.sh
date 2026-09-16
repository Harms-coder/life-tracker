#!/bin/sh
# Builds the web versions of the background scenes from the raw Higgsfield files.
#   baggrund-kilder/<noget med morgen|middag|aften|nat>.png|jpg|mp4  ->  public/baggrund/<tid>.jpg / <tid>.mp4
# Image: 1440x2560 JPEG (sharp on a 3x phone). Video: H.264 1080x1920 24 fps, no audio, and the loop is made seamless by
# crossfading the last second into the first second (so the clip ends where it starts).
set -e
cd "$(dirname "$0")/.."
export PATH=/opt/homebrew/bin:$PATH
mkdir -p public/baggrund
for f in baggrund-kilder/*; do
  lower=$(basename "$f" | tr '[:upper:]' '[:lower:]')
  slot=""; for s in morgen middag aften nat; do case "$lower" in *$s*) slot=$s;; esac; done
  [ -z "$slot" ] && { echo "?? $f – navnet siger ikke morgen/middag/aften/nat, springer over"; continue; }
  case "$lower" in
    *.png|*.jpg|*.jpeg)
      echo "$f -> public/baggrund/$slot.jpg"
      ffmpeg -v error -y -i "$f" -vf "scale=1440:2560:force_original_aspect_ratio=increase,crop=1440:2560" -q:v 3 "public/baggrund/$slot.jpg";;
    *.mp4|*.mov)
      dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
      fade=1; body=$(echo "$dur - $fade" | bc); off=$(echo "$dur - 2*$fade" | bc)
      echo "$f -> public/baggrund/$slot.mp4 (loop ${body}s, crossfade ${fade}s)"
      ffmpeg -v error -y -i "$f" -filter_complex \
        "[0:v]trim=$fade:$dur,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[a];\
         [0:v]trim=0:$fade,setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[b];\
         [a][b]xfade=transition=fade:duration=$fade:offset=$off" \
        -an -r 24 -c:v libx264 -preset slow -crf 26 -profile:v high -level 4.1 -pix_fmt yuv420p -movflags +faststart "public/baggrund/$slot.mp4";;
  esac
done
ls -la public/baggrund
