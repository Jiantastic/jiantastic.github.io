# Poddy Summaries

Automated podcast summaries with timestamped quotes. Currently processing the [Acquired](https://www.acquired.fm/) podcast feed.

## How It Works

```
RSS Feed → Download Audio → Transcribe (Whisper) → Summarize (Claude) → Web UI
```

1. **Fetch** - Pull new episodes from RSS, skip already-processed
2. **Transcribe** - MLX Whisper generates timestamped segments
3. **Summarize** - Claude extracts key quotes with accurate timestamps
4. **Display** - Web UI with clickable timestamps that seek the audio player

## Quick Start

```bash
# Process latest episode
cd scripts && ./run.sh --limit 1

# View locally
bundle exec jekyll serve
# Open http://localhost:4000/poddy-summaries/
```

## Output

Each episode generates:

- **Summary bullets** - Key takeaways with verbatim quotes and `MM:SS` timestamps
- **Full transcript** - Searchable text with segment timing
- **Audio player** - Stream from source, seek via timestamp clicks

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
