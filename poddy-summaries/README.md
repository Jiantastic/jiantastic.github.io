# Poddy Summaries

Independent, readable episode guides for the [Acquired](https://www.acquired.fm/) podcast: concise overviews, five evidence-backed insights, chapter jumps, and paragraph-form transcripts.

## How It Works

```
RSS Feed → Download Audio → Transcribe (Whisper) → Summarize (Claude) → Web UI
```

1. **Fetch** - Pull new episodes from RSS, skip already-processed
2. **Transcribe** - MLX Whisper generates timed segments, then groups them into readable paragraphs
3. **Summarize** - Claude produces a validated overview, key insights, and full-episode chapters
4. **Publish** - The main archive and one static page per episode render complete, indexable content with canonical metadata, JSON-LD, and sitemap entries

## Quick Start

```bash
# Process latest episode
cd scripts && ./run.sh --limit 1

# Resume the entire unprocessed archive, newest first
./run.sh --all

# View locally
bundle exec jekyll serve
# Open http://localhost:4000/poddy-summaries/

# Validate summaries, timestamps, transcripts, and permanent pages
python3 scripts/validate_data.py
```

## Output

Each episode generates:

- **Episode guide** - Two-paragraph overview, five key insights, and 8–12 chapters
- **Full transcript** - Searchable paragraphs with one seekable timestamp per paragraph
- **Audio player** - Stream from source, seek via timestamp clicks
- **Permanent episode page** - Crawlable summary/transcript URL with PodcastEpisode structured data

## Stack

| Component     | Tool                         |
| ------------- | ---------------------------- |
| Transcription | MLX Whisper (large-v3-turbo) |
| Summarization | Claude (`claude -p`)         |
| Web UI        | Vanilla JS + Jekyll          |

## Project Structure

```
poddy-summaries/
  index.html          # Web UI
  app.js              # Client logic
  styles.css          # Styling
  scripts/            # CLI pipeline
  data/acquired/      # Transcripts, summaries, state
  claude.md           # Detailed implementation docs
```

See [claude.md](./claude.md) for implementation details.
