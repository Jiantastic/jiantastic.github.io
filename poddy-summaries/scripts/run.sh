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

valid_summary() {
  jq -e '
    type == "object" and
    (.overview | type == "array" and length == 2 and all(.[]; type == "string" and length > 0)) and
    (.takeaways | type == "array" and length == 5 and all(.[];
      (.title | type == "string" and length > 0) and
      (.detail | type == "string" and length > 0)
    )) and
    (.chapters | type == "array" and length >= 8 and length <= 12 and all(.[];
      (.title | type == "string" and length > 0) and
      (.summary | type == "string" and length > 0) and
      (.quote | type == "string") and
      (.timestamp | type == "string" and test("^([0-9]+:)?[0-5]?[0-9]:[0-5][0-9]$"))
    ))
  ' "$1" >/dev/null 2>&1
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

  IFS= read -r -d '' prompt <<'EOF' || true
You are producing a useful full-episode listening guide.
The transcript below is grouped into timestamped paragraphs.
Return JSON with:
- `overview`: exactly two concise paragraphs as an array of strings. The first states the episode's central argument; the second explains the most important arc or tension. Each paragraph must be under 80 words.
- `takeaways`: exactly five objects shaped as {"title":"","detail":""}. The title is a specific claim of no more than eight words. The detail explains the evidence, mechanism, or consequence in one or two concrete sentences. Avoid generic lessons.
- `chapters`: 8-12 items distributed across the entire runtime, including the beginning, middle, and final quarter. Do not cluster chapters in the introduction.
Each chapter: {"title":"","summary":"","quote":"","timestamp":"H:MM:SS"}
- `title`: a specific, useful chapter heading.
- `summary`: 1-2 sentences explaining why the section matters.
- `quote`: a short verbatim snippet, no more than 14 words.
- `timestamp`: use the transcript timestamp immediately before the quoted moment. MM:SS is acceptable before one hour.
Only output valid JSON with no commentary or markdown fences.

Transcript:
EOF

  if [ -s "$summary_path" ] && valid_summary "$summary_path"; then
    log "Reusing existing summary for $slug"
  else
    log "Summarizing via claude -p -> $summary_path"
    temp_summary=$(mktemp /tmp/poddy-summary-XXXXXX)
    {
      printf '%s\n' "$prompt"
      cat "$timed_transcript"
    } | claude -p --output-format text > "$temp_summary"

    if ! valid_summary "$temp_summary"; then
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

log "Rebuilding episodes.json"
python3 "$DIR/build_episodes.py" --feed "$FEED" --data-dir "$DATA"

log "Done"
