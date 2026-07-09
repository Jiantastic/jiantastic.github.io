#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
DATA="$ROOT/data/acquired"
STATE="$DATA/state.json"
FEED_DEFAULT="https://feeds.transistor.fm/acquired"
LIMIT=1
DRY_RUN=0
VERBOSE=0
FEED="$FEED_DEFAULT"

log() {
  echo "[poddy] $*"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing dependency: $1" >&2
    exit 1
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --limit)
      LIMIT="$2"; shift 2 ;;
    --feed)
      FEED="$2"; shift 2 ;;
    --dry-run)
      DRY_RUN=1; shift ;;
    --verbose)
      VERBOSE=1; shift ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1 ;;
  esac
done

if ! [[ "$LIMIT" =~ ^[1-9][0-9]*$ ]]; then
  echo "--limit must be a positive integer" >&2
  exit 1
fi

require_cmd python3
require_cmd jq
if [ "$DRY_RUN" -eq 0 ]; then
  require_cmd ffmpeg
  require_cmd curl
  require_cmd claude
  mkdir -p "$DATA" "$DATA/transcripts" "$DATA/summaries"
  if [ ! -f "$STATE" ]; then
    echo '{"processed":[]}' > "$STATE"
  fi
fi

log "Fetching feed: $FEED"
feed_json=$(python3 "$DIR/feed_fetch.py" --feed "$FEED")

if [ -f "$STATE" ]; then
  processed_list=$(jq '.processed' "$STATE")
else
  processed_list='[]'
fi
new_eps=$(jq -c --argjson processed "$processed_list" '.episodes | map(select((.guid|tostring) as $g | ($processed|index($g)|not)))' <<<"$feed_json")

count=$(jq 'length' <<<"$new_eps")
if [ "$count" -eq 0 ]; then
  log "No new episodes to process."
  exit 0
fi

process_list=$(jq -c --argjson limit "$LIMIT" '.[0:$limit]' <<<"$new_eps")
log "Processing $(jq 'length' <<<"$process_list") episode(s)"

temp_audio=""
cleanup() {
  if [ -n "$temp_audio" ] && [ -f "$temp_audio" ]; then rm -f "$temp_audio"; fi
}
trap cleanup EXIT

index=0
while IFS= read -r ep; do
  index=$((index+1))
  guid=$(jq -r '.guid' <<<"$ep")
  title=$(jq -r '.title' <<<"$ep")
  slug=$(jq -r '.slug' <<<"$ep")
  audio_url=$(jq -r '.audioUrl' <<<"$ep")
  log "[$index] ${title}"

  if [ "$DRY_RUN" -eq 1 ]; then
    log "Dry-run: would download, transcribe, and summarize $guid"
    continue
  fi

  temp_audio=$(mktemp /tmp/poddy-audio-XXXXXX.mp3)
  log "Downloading audio -> $temp_audio"
  curl -L --fail --retry 3 --retry-delay 2 -o "$temp_audio" "$audio_url"

  python3 "$DIR/transcribe.py" --audio "$temp_audio" --slug "$slug" --title "$title" --data-dir "$DATA"

  IFS= read -r -d '' prompt <<'EOF' || true
You are producing concise podcast summary bullets.
The transcript below has inline timestamps in [MM:SS] format.
Return JSON with a `bullets` array of 5-8 items.
Each bullet: {"fact":"","quote":"","timestamp":"MM:SS","speaker":""}
- `fact`: concise takeaway.
- `quote`: short verbatim snippet (keep punctuation).
- `timestamp`: use the [MM:SS] timestamp immediately before the quote in the transcript.
- `speaker`: name if clear, else "".
Only output valid JSON matching: {"bullets": [ ... ]}

Transcript:
EOF

  summary_path="$DATA/summaries/$slug.json"
  timed_transcript="$DATA/transcripts/$slug-timed.txt"
  log "Summarizing via claude -p -> $summary_path"
  {
    printf '%s\n' "$prompt"
    cat "$timed_transcript"
  } | claude -p --output-format json > "$summary_path"

  log "Updating state"
  tmp_state=$(mktemp /tmp/poddy-state-XXXXXX.json)
  jq --arg guid "$guid" '.processed += [$guid] | .processed |= unique' "$STATE" > "$tmp_state"
  mv "$tmp_state" "$STATE"

  cleanup
  temp_audio=""
done < <(jq -c '.[]' <<<"$process_list")

log "Rebuilding episodes.json"
python3 "$DIR/build_episodes.py" --feed "$FEED" --data-dir "$DATA"

log "Done"
