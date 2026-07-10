# Poddy Summaries — implementation notes

## Pipeline

`run.sh` fetches the RSS feed, skips GUIDs already recorded in `state.json`, downloads each selected episode to a temporary file, runs MLX Whisper, asks Claude for a structured guide, validates the result with `jq`, and rebuilds `episodes.json` plus the static search-facing pages.

The source audio is never committed. Only text, timestamps, summary data, and RSS metadata live in the site.

## Transcript contract

`transcripts/<slug>.json` keeps both the original ASR segments and the reading view:

```json
{
  "title": "Episode title",
  "slug": "episode-slug",
  "language": "en",
  "segments": [
    { "start": 0.0, "end": 4.2, "text": "A short ASR segment." }
  ],
  "paragraphs": [
    { "start": 0.0, "end": 62.4, "text": "A complete readable paragraph..." }
  ]
}
```

Paragraphs target roughly 80 words and break earlier at 75 seconds or later at 125 words. The web UI can derive paragraphs from legacy segment-only JSON with the same rules.

The plain-text transcript separates paragraphs with blank lines. The timed transcript uses one `[H:MM:SS]` timestamp per paragraph and is the input to summarization.

## Summary contract

`summaries/<slug>.json` contains:

```json
{
  "overview": ["Central argument.", "Important arc or tension."],
  "takeaways": [
    { "title": "A specific claim", "detail": "Evidence, mechanism, or consequence." }
  ],
  "chapters": [
    {
      "title": "Chapter title",
      "summary": "Why this section matters.",
      "quote": "Short transcript excerpt",
      "timestamp": "1:23:45"
    }
  ]
}
```

The pipeline requires exactly two overview paragraphs, five takeaways, and a duration-aware chapter count: 1–3 for items under five minutes, 3–6 for items under thirty minutes, and 8–12 for full episodes. Claude writes plain JSON with `--output-format text`; `jq` validates the content before the existing summary is replaced. This avoids padding short announcements with repeated timestamps or saving the Claude CLI's JSON response envelope as episode data.

## Search-facing pages

`build_episodes.py` produces three related surfaces from the same validated data:

- `data/acquired/episodes.json` for the interactive archive
- `_includes/poddy-episode-directory.html` for a server-rendered list of every completed guide
- `episodes/<slug>/index.html` for a permanent episode URL containing the full overview, insights, chapters, transcript, canonical metadata, and `PodcastEpisode` JSON-LD

Published duration uses the later of the RSS duration and the transcribed media end. This keeps chapter validation and structured data accurate when dynamically inserted ads make the downloaded audio longer than the feed metadata.

Run `build_episodes.py --offline` to regenerate the static pages without fetching RSS. Jekyll's sitemap plugin includes every generated episode route automatically.

## Commands

```bash
# Inspect which episode would be selected
./scripts/run.sh --dry-run --limit 1

# Process five new episodes
./scripts/run.sh --limit 5

# Process every remaining episode, newest first; safe to resume after interruption
./scripts/run.sh --all

# Rebuild permanent pages without touching the feed
./scripts/build_episodes.py --offline

# Run browser/unit checks
npm test -- --run poddy-summaries/app.test.js
```

Requirements: Apple Silicon, `mlx-whisper`, `feedparser`, `ffmpeg`, `curl`, `jq`, and an authenticated Claude CLI.
