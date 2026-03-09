# Poddy Summaries - Implementation Details

Detailed technical documentation for the podcast summarization pipeline.

## Pipeline Architecture

### Scripts

| Script              | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `run.sh`            | Bash orchestrator - coordinates the full pipeline |
| `feed_fetch.py`     | Parses RSS feed, extracts episode metadata        |
| `transcribe.py`     | Runs MLX Whisper, outputs text + timed segments   |
| `build_episodes.py` | Rebuilds `episodes.json` from processed artifacts |

### Data Flow

```
RSS Feed (feedparser)
    ↓
Episode metadata (guid, title, audioUrl, pubDate)
    ↓
Download audio to temp file (curl)
    ↓
Transcribe (mlx_whisper)
    ├── <slug>.txt        # Plain text transcript
    ├── <slug>.json       # Segments with start/end times
    └── <slug>-timed.txt  # Inline [MM:SS] timestamps
    ↓
Summarize (claude -p)
    └── summaries/<slug>.json  # Bullets with quotes + timestamps
    ↓
Build episodes.json (aggregates all processed episodes)
    ↓
Web UI (app.js loads episodes.json)
```

## Data Contracts

### state.json

Tracks processed episodes by GUID:

```json
{ "processed": ["<guid>", ...] }
```

### transcripts/<slug>.json

Whisper output with segment timing:

```json
{
  "title": "Episode Title",
  "slug": "episode-slug",
  "language": "en",
  "segments": [
    { "start": 0.5, "end": 1.36, "text": " Happy 10 years." },
    { "start": 1.56, "end": 3.04, "text": " Happy 10 year anniversary, Ben." }
  ]
}
```

### transcripts/<slug>-timed.txt

Inline timestamps for LLM consumption:

```
[00:00] Happy 10 years. [00:01] Happy 10 year anniversary, Ben. [00:03] It's crazy it's been 10 years.
```

### summaries/<slug>.json

LLM-generated summary bullets:

```json
{
  "bullets": [
    {
      "fact": "Hosts celebrate 10th anniversary of Acquired",
      "quote": "Happy 10 year anniversary, Ben",
      "timestamp": "00:01",
      "speaker": ""
    }
  ]
}
```

### episodes.json

UI-ready aggregate consumed by `app.js`:

```json
[
  {
    "slug": "episode-slug",
    "guid": "<guid>",
    "title": "Episode Title",
    "pubDate": "Sun, 14 Dec 2025 20:19:45 -0800",
    "audioUrl": "https://...",
    "duration": "10057",
    "summaryPath": "summaries/episode-slug.json",
    "transcriptPath": "transcripts/episode-slug.txt",
    "bullets": [...]
  }
]
```

## LLM Summarization

### Command

```bash
{
  printf '%s\n' "$prompt"
  cat "$DATA/transcripts/$slug-timed.txt"
} | claude -p --output-format json > summaries/$slug.json
```

### Prompt

```
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
<timed transcript content>
```

### Why Timed Transcripts?

The LLM needs actual timestamps to produce accurate `MM:SS` values. Without them, it guesses (and gets them wrong). The `-timed.txt` format embeds `[MM:SS]` inline so the LLM can reference the exact timestamp preceding each quote.

## Dependencies

### CLI Tools

- `claude` - Claude Code CLI for headless summarization
- `jq` - JSON processing
- `curl` - Audio download
- `ffmpeg` - Audio processing (required by Whisper)

### Python (3.10+)

- `mlx-whisper` - Apple Silicon optimized Whisper
- `feedparser` - RSS parsing

## CLI Usage

```bash
./run.sh [options]

Options:
  --limit N      Process up to N new episodes (default: 1)
  --feed <url>   Override RSS feed URL
  --dry-run      Skip transcribe + summarize steps
  --verbose      Extra logging
```

### Examples

```bash
# Process one episode
./run.sh --limit 1

# Process 5 episodes
./run.sh --limit 5

# Test without LLM/transcription
./run.sh --dry-run

# Use different feed
./run.sh --feed "https://example.com/feed.xml"
```

## Web UI

### Components

- **Episode selector** - Dropdown populated from `episodes.json`
- **Summary tab** - Bullet cards with clickable timestamp buttons
- **Audio tab** - HTML5 audio player streaming from RSS enclosure URL
- **Transcript tab** - Scrollable plain text

### Timestamp Seeking

Clicking a `[MM:SS]` button in the summary:

1. Parses timestamp to seconds
2. Sets `audio.currentTime`
3. Calls `audio.play()`

### Local Development

```bash
bundle exec jekyll serve
# Open http://localhost:4000/poddy-summaries/
```

Avoids file:// CORS issues with fetch requests.

## Extending to Other Feeds

1. Create new data directory: `data/<feed-name>/`
2. Run with custom feed: `./run.sh --feed "<url>" --data-dir data/<feed-name>`
3. Update UI to support feed selection (future work)

## Troubleshooting

### Model download slow on first run

MLX Whisper downloads `whisper-large-v3-turbo` (~1.5GB) on first use. Subsequent runs use cached model.

### Transcription takes too long

Large episodes (2+ hours) can take 10-20 minutes on M1/M2. Consider `--limit 1` for testing.

### Claude returns malformed JSON

Ensure `--output-format json` flag is set. The prompt explicitly requests JSON-only output.

### CORS errors in browser

Serve via Jekyll (`bundle exec jekyll serve`) rather than opening `file://` directly.
