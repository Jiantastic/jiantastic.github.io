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
TRANSCRIBE_ONLY=0
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

valid_summary() {
  local summary_path="$1"
  local chapter_min="$2"
  local chapter_max="$3"
  jq -e --argjson chapter_min "$chapter_min" --argjson chapter_max "$chapter_max" '
    type == "object" and
    (.overview | type == "array" and length == 2 and all(.[]; type == "string" and length > 0)) and
    (.takeaways | type == "array" and length == 5 and all(.[];
      (.title | type == "string" and length > 0) and
      (.detail | type == "string" and length > 0)
    )) and
    (.chapters | type == "array" and length >= $chapter_min and length <= $chapter_max and all(.[];
      (.title | type == "string" and length > 0) and
      (.summary | type == "string" and length > 0) and
      (.quote | type == "string") and
      (.timestamp | type == "string" and test("^([0-9]+:)?[0-5]?[0-9]:[0-5][0-9]$"))
    ))
  ' "$summary_path" >/dev/null 2>&1
}

duration_seconds() {
  local value="$1"
  local first=""
  local second=""
  local third=""
  if [[ "$value" =~ ^[0-9]+$ ]]; then
    echo "$value"
    return
  fi
  IFS=: read -r first second third <<<"$value"
  if [ -n "$third" ]; then
    echo $((10#$first * 3600 + 10#$second * 60 + 10#$third))
  elif [ -n "$second" ]; then
    echo $((10#$first * 60 + 10#$second))
  else
    echo 0
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --limit)
      LIMIT="$2"; shift 2 ;;
    --all)
      LIMIT=999999; shift ;;
    --feed)
      FEED="$2"; shift 2 ;;
    --dry-run)
      DRY_RUN=1; shift ;;
    --verbose)
      VERBOSE=1; shift ;;
    --transcribe-only)
      TRANSCRIBE_ONLY=1; shift ;;
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
  if [ "$TRANSCRIBE_ONLY" -eq 0 ]; then
    require_cmd claude
  fi
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

if [ "$TRANSCRIBE_ONLY" -eq 1 ]; then
  transcribed_list=$(python3 - "$DATA/transcripts" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
complete = [
    path.stem
    for path in root.glob("*.json")
    if path.stat().st_size > 0
    and (root / f"{path.stem}-timed.txt").is_file()
    and (root / f"{path.stem}-timed.txt").stat().st_size > 0
]
print(json.dumps(complete))
PY
  )
  new_eps=$(jq -c --argjson transcribed "$transcribed_list" 'map(select(.slug as $slug | ($transcribed | index($slug) | not)))' <<<"$new_eps")
fi

count=$(jq 'length' <<<"$new_eps")
if [ "$count" -eq 0 ]; then
  if [ "$DRY_RUN" -eq 0 ] && [ "$TRANSCRIBE_ONLY" -eq 0 ]; then
    log "No new episodes; rebuilding published data from completed state"
    python3 "$DIR/build_episodes.py" --feed "$FEED" --data-dir "$DATA"
  fi
  log "No new episodes to process."
  exit 0
fi

process_list=$(jq -c --argjson limit "$LIMIT" '.[0:$limit]' <<<"$new_eps")
log "Processing $(jq 'length' <<<"$process_list") episode(s)"

temp_audio=""
temp_summary=""
cleanup() {
  if [ -n "$temp_audio" ] && [ -f "$temp_audio" ]; then rm -f "$temp_audio"; fi
  if [ -n "$temp_summary" ] && [ -f "$temp_summary" ]; then rm -f "$temp_summary"; fi
}
trap cleanup EXIT

index=0
while IFS= read -r ep; do
  index=$((index+1))
  guid=$(jq -r '.guid' <<<"$ep")
  title=$(jq -r '.title' <<<"$ep")
  slug=$(jq -r '.slug' <<<"$ep")
  audio_url=$(jq -r '.audioUrl' <<<"$ep")
  duration_raw=$(jq -r '.duration // ""' <<<"$ep")
  duration=$(duration_seconds "$duration_raw")
  if [ "$duration" -le 300 ]; then
    chapter_min=1
    chapter_max=3
    chapter_guidance="1-3 items covering the complete short announcement or trailer without repeating the same moment."
  elif [ "$duration" -le 1800 ]; then
    chapter_min=3
    chapter_max=6
    chapter_guidance="3-6 items distributed across the complete short episode, including the beginning and ending."
  else
    chapter_min=8
    chapter_max=12
    chapter_guidance="8-12 items distributed across the entire runtime, including the beginning, middle, and final quarter. Do not cluster chapters in the introduction."
  fi
  summary_path="$DATA/summaries/$slug.json"
  transcript_json="$DATA/transcripts/$slug.json"
  timed_transcript="$DATA/transcripts/$slug-timed.txt"
  log "[$index] ${title}"

  if [ "$DRY_RUN" -eq 1 ]; then
    log "Dry-run: would download, transcribe, and summarize $guid"
    continue
  fi

  if [ -s "$transcript_json" ] && [ -s "$timed_transcript" ]; then
    log "Reusing existing transcript for $slug"
  else
    temp_audio=$(mktemp /tmp/poddy-audio-XXXXXX)
    log "Downloading audio -> $temp_audio"
    curl -L --fail --retry 3 --retry-delay 2 -o "$temp_audio" "$audio_url"
    python3 "$DIR/transcribe.py" --audio "$temp_audio" --slug "$slug" --title "$title" --data-dir "$DATA"
    cleanup
    temp_audio=""
  fi

  if [ "$TRANSCRIBE_ONLY" -eq 1 ]; then
    log "Transcription-only: summary deferred for $slug"
    continue
  fi

  IFS= read -r -d '' prompt <<'EOF' || true
You are producing a useful full-episode listening guide.
The transcript below is grouped into timestamped paragraphs.
Return JSON with:
- `overview`: exactly two concise paragraphs as an array of strings. The first states the episode's central argument; the second explains the most important arc or tension. Each paragraph must be under 80 words.
- `takeaways`: exactly five objects shaped as {"title":"","detail":""}. The title is a specific claim of no more than eight words. The detail explains the evidence, mechanism, or consequence in one or two concrete sentences. Avoid generic lessons.
- `chapters`: __CHAPTER_GUIDANCE__
Each chapter: {"title":"","summary":"","quote":"","timestamp":"H:MM:SS"}
- `title`: a specific, useful chapter heading.
- `summary`: 1-2 sentences explaining why the section matters.
- `quote`: a short verbatim snippet, no more than 14 words.
- `timestamp`: use the transcript timestamp immediately before the quoted moment. MM:SS is acceptable before one hour.
Only output valid JSON with no commentary or markdown fences.

Transcript:
EOF
  prompt=${prompt/__CHAPTER_GUIDANCE__/$chapter_guidance}

  if [ -s "$summary_path" ] && valid_summary "$summary_path" "$chapter_min" "$chapter_max"; then
    log "Reusing existing summary for $slug"
  else
    log "Summarizing via claude -p -> $summary_path"
    temp_summary=$(mktemp /tmp/poddy-summary-XXXXXX)
    if ! {
      printf '%s\n' "$prompt"
      cat "$timed_transcript"
    } | claude -p --output-format text > "$temp_summary"; then
      if [ -s "$temp_summary" ]; then
        sed -n '1,8p' "$temp_summary" >&2
      fi
      echo "Claude CLI failed for $slug; the completed transcript is preserved for retry." >&2
      exit 1
    fi

    if ! valid_summary "$temp_summary" "$chapter_min" "$chapter_max"; then
      echo "Claude returned an invalid episode summary for $slug; leaving existing data unchanged." >&2
      exit 1
    fi
    mv "$temp_summary" "$summary_path"
    temp_summary=""
  fi

  log "Updating state"
  tmp_state=$(mktemp /tmp/poddy-state-XXXXXX)
  jq --arg guid "$guid" '.processed += [$guid] | .processed |= unique' "$STATE" > "$tmp_state"
  mv "$tmp_state" "$STATE"

  cleanup
  temp_audio=""
  temp_summary=""
done < <(jq -c '.[]' <<<"$process_list")

if [ "$DRY_RUN" -eq 1 ]; then
  log "Dry-run complete"
  exit 0
fi

if [ "$TRANSCRIBE_ONLY" -eq 1 ]; then
  log "Transcription-only pass complete; state and published data were not changed"
  exit 0
fi

log "Rebuilding episodes.json"
python3 "$DIR/build_episodes.py" --feed "$FEED" --data-dir "$DATA"

log "Done"
