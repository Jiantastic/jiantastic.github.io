# Poddy Summaries — implementation notes

## Pipeline

`run.sh` fetches the RSS feed, skips GUIDs already recorded in `state.json`, downloads each selected episode to a temporary file, runs MLX Whisper, asks Claude for a structured guide, validates the result with `jq`, and rebuilds `episodes.json`.

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

The pipeline requires exactly two overview paragraphs, five takeaways, and 8–12 valid chapters. Claude writes plain JSON with `--output-format text`; `jq` validates the content before the existing summary is replaced. This avoids saving the Claude CLI's JSON response envelope as episode data.

## Commands

```bash
# Inspect which episode would be selected
./scripts/run.sh --dry-run --limit 1

# Process five new episodes
./scripts/run.sh --limit 5

# Run browser/unit checks
npm test -- --run poddy-summaries/app.test.js
```

Requirements: Apple Silicon, `mlx-whisper`, `feedparser`, `ffmpeg`, `curl`, `jq`, and an authenticated Claude CLI.
