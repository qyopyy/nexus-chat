#!/usr/bin/env bash
# LaunchAgent entry point: restreams the console video to Kick for spectators, so only the player
# in control (and a few web viewers) use WebRTC from this machine. Reads the stream from MediaMTX's
# loopback RTSP server, re-encodes it with the hardware H.264 encoder (fixed 2 s keyframes and a
# capped bitrate, as Kick's ingest requires) and pushes it over RTMPS.
#
# Layers:
#   - overlay (scripts/kick-overlay.ts): a corner card, re-read as a PNG;
#   - standby slate: while the console itself has ended Remote Play (lib.sh), a full-frame
#     "BE RIGHT BACK" countdown; when it ends, the stream ends;
#   - outage slate: no video for another reason, a slate with a repeating 10-minute countdown;
#   - paused slate: PAUSED=on streams a still "paused" image with silence.
# Settings: KICK_STREAM_URL and KICK_STREAM_KEY (kick.env in the config folder, mode 600),
# PUBLIC_URL, OVERLAY_TITLE, PAUSED. The stream key is redacted from ffmpeg's output, but it is part
# of the output URL on ffmpeg's command line, which other local accounts can read with ps(1).
# See docs/security.md.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

kick_setting() {
  local value; value="$(setting "$1")"
  [[ -z "$value" && -f "$KICK_ENV" ]] && value="$(ENV_FILE="$KICK_ENV" env_value "$1")"
  printf '%s' "$value"
}
is_on() { [[ "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" =~ ^(1|true|on|yes)$ ]]; }

stream_url="$(kick_setting KICK_STREAM_URL)"
stream_key="$(kick_setting KICK_STREAM_KEY)"
bitrate=6000 # kbps
video_path=console
source_url="rtsp://127.0.0.1:8554/$video_path"

if [[ -z "$stream_url" || -z "$stream_key" ]]; then
  log "KICK_STREAM_URL / KICK_STREAM_KEY not set: not streaming"
  exec sleep 31536000 # idle, so launchd does not restart this agent in a loop
fi
command -v ffmpeg >/dev/null || { log "ffmpeg is not installed"; exit 1; }
command -v bun >/dev/null || { log "bun is not installed"; exit 1; }
mkdir -p "$CONFIG_DIR"

target="${stream_url%/}/$stream_key"
# Pure bash, so the key is not handed to yet another command line.
redact() { local line; while IFS= read -r line; do printf '%s\n' "${line//"$stream_key"/<stream-key>}"; done; }

video_info() { mediamtx_api "/v3/paths/get/$video_path" 2>/dev/null; }
video_live() { video_info | grep -q '"ready":true'; }
# Changes every time chiaki-ng reconnects; empty when offline.
publish_id() { video_info | grep -o '"readyTime":"[^"]*"' | head -1; }

overlay_png="$CONFIG_DIR/overlay.png"
slate_png="$CONFIG_DIR/slate.png"
progress_file="$CONFIG_DIR/kick-progress.txt"
renderer_pid="" slate_pid=""

overlay_env() {
  PORT="$(setting PORT)" PUBLIC_URL="$(setting PUBLIC_URL)" OVERLAY_TITLE="$(setting OVERLAY_TITLE)" "$@"
}

# respawn VAR NAME COMMAND...: runs COMMAND in a loop that restarts it if it exits; the loop's pid
# goes into VAR. (No command substitution: the background loop would hold its pipe open.)
respawn() {
  local var="$1" name="$2"; shift 2
  ( while true; do "$@"; echo "$(date '+%F %T') $name exited: restarting in 2 s"; sleep 2; done ) &
  printf -v "$var" '%s' "$!"
}
stop_pid() { [[ -n "$1" ]] && { pkill -P "$1"; kill "$1"; wait "$1"; } 2>/dev/null; return 0; }

start_renderer() {
  [[ -n "$renderer_pid" ]] && kill -0 "$renderer_pid" 2>/dev/null && return 0
  rm -f "$overlay_png"
  respawn renderer_pid overlay overlay_env bun "$REPO_ROOT/scripts/kick-overlay.ts" "$overlay_png"
  for _ in {1..20}; do [[ -f "$overlay_png" ]] && break; sleep 0.5; done
}

trap 'stop_pid "$renderer_pid"; stop_pid "$slate_pid"' EXIT

overlay_fresh() {
  [[ -f "$overlay_png" ]] && (($(date +%s) - $(stat -f %m "$overlay_png") < 10))
}

# Smooth frame pacing: Wi-Fi bursts between the console and this machine become repeated and
# skipped frames at a fixed 30 fps. Spectators are seconds behind anyway, so hold the video a
# little and lay frames out 1/30 s apart, steering slowly toward the arrival clock.
SMOOTH_DELAY=0.25
SMOOTH="setpts='if(eq(N\,0)\,PTS+$SMOOTH_DELAY/TB\,PREV_OUTPTS+1/(30*TB)+0.05*(PTS+$SMOOTH_DELAY/TB-PREV_OUTPTS-1/(30*TB)))',fps=30"
ENCODE=(-c:v h264_videotoolbox -realtime 1 -profile:v high -constant_bit_rate 1 -prio_speed 0 -bf 0
  -b:v "${bitrate}k" -maxrate "${bitrate}k" -bufsize "${bitrate}k"
  -force_key_frames 'expr:gte(t,n_forced*2)'
  -c:a aac -b:a 160k -ar 48000 -ac 2
  -f flv "$target")
STALL_SECONDS=15

# stream_image PNG CONDITION...: streams a still (re-read 10 times a second) with silence while
# CONDITION succeeds.
stream_image() {
  local png="$1"; shift
  ffmpeg -hide_banner -nostdin -loglevel warning \
    -re -thread_queue_size 2 -f image2 -loop 1 -framerate 10 -i "$png" \
    -re -f lavfi -i anullsrc=r=48000:cl=stereo \
    -map 0:v -map 1:a -vf "fps=30,format=nv12" "${ENCODE[@]}" > >(redact) 2>&1 &
  local pid=$!
  while kill -0 "$pid" 2>/dev/null && "$@"; do sleep 2; done
  kill "$pid" 2>/dev/null; sleep 1; kill -9 "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
}

paused() { is_on "$(setting PAUSED)"; }

# slate MODE: standby (countdown to the standby deadline) or outage (a 10-minute countdown).
outage_until=0
slate_condition() {
  video_live && { log "slate: the video is back"; return 1; }
  paused && return 1
  if [[ "$1" == outage ]]; then (($(date +%s) < outage_until)) || return 1
  else standby_active && (($(standby_left "$(date +%s)") > 0)) || return 1; fi
}
stream_slate() {
  local mode="$1" until
  if [[ "$mode" == outage ]]; then outage_until=$(($(date +%s) + 600)); until=$outage_until; else until="$(standby_until)"; fi
  rm -f "$slate_png"
  respawn slate_pid slate overlay_env bun "$REPO_ROOT/scripts/kick-overlay.ts" "$slate_png" --standby "${until}000"
  for _ in {1..20}; do [[ -f "$slate_png" ]] && break; sleep 0.5; done
  if [[ -f "$slate_png" ]]; then
    log "$mode: streaming the slate"
    stream_image "$slate_png" slate_condition "$mode"
  else
    log "$mode: the slate renderer wrote nothing"; sleep 5
  fi
  stop_pid "$slate_pid"; slate_pid=""
}

while true; do
  if paused; then
    overlay_env bun "$REPO_ROOT/scripts/kick-overlay.ts" "$slate_png" --paused || { sleep 5; continue; }
    log "paused: streaming the paused slate"
    stream_image "$slate_png" paused
    continue
  fi

  offline_since=$(date +%s)
  until video_live || paused; do
    if (($(standby_left "$(date +%s)") > 0)); then stream_slate standby
    elif (($(date +%s) - offline_since >= 20)); then stream_slate outage
    else sleep 5; fi
  done
  paused && continue

  start_renderer
  args=(-hide_banner -nostdin -loglevel warning -rtsp_transport tcp -timeout 10000000 -i "$source_url")
  if overlay_fresh; then
    args+=(-thread_queue_size 2 -f image2 -loop 1 -framerate 4 -i "$overlay_png")
    args+=(-filter_complex "[0:v]${SMOOTH}[base];[base][1:v]overlay=32:28:eof_action=repeat,format=nv12[v]" -map '[v]')
    mode="with overlay"
  else
    args+=(-map 0:v:0 -vf "$SMOOTH")
    mode="without overlay"
  fi
  args+=(-map '0:a:0?' -af "asetpts=PTS+$SMOOTH_DELAY/TB" "${ENCODE[@]}")
  log "streaming $source_url at ${bitrate} kbps, $mode"

  # The looping overlay keeps ffmpeg alive on a frozen frame when the source ends, so restart it
  # when the source's publish changes, and when its output time stops moving (a hung upload).
  source_id="$(publish_id)"
  rm -f "$progress_file"
  ffmpeg -progress "$progress_file" -stats_period 1 "${args[@]}" > >(redact) 2>&1 &
  ffmpeg_pid=$!
  last_out="" last_change=$(date +%s)
  while kill -0 "$ffmpeg_pid" 2>/dev/null; do
    sleep 2
    reason=""
    if paused; then reason="paused"
    elif [[ "$(publish_id)" != "$source_id" ]]; then reason="the console stream restarted"
    else
      out="$(grep '^out_time_us=' "$progress_file" 2>/dev/null | tail -1)"
      if [[ "$out" != "$last_out" ]]; then last_out="$out" last_change=$(date +%s)
      elif (($(date +%s) - last_change >= STALL_SECONDS)); then reason="output stalled for ${STALL_SECONDS}s"; fi
    fi
    if [[ -n "$reason" ]]; then
      log "$reason: restarting ffmpeg"
      kill "$ffmpeg_pid" 2>/dev/null; sleep 2; kill -9 "$ffmpeg_pid" 2>/dev/null
      break
    fi
  done
  wait "$ffmpeg_pid" 2>/dev/null
  status=$?
  if standby_active || paused; then log "ffmpeg exited (status $status)"
  else log "ffmpeg exited (status $status): retrying in 5 s"; sleep 5; fi
done
