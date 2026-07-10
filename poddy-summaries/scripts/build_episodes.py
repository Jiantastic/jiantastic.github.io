#!/usr/bin/env python3
import argparse
import json
from email.utils import parsedate_to_datetime
from html import escape
from pathlib import Path
from feed_fetch import parse_feed


SITE_URL = "https://weijwong.com"
PODCAST_URL = "https://www.acquired.fm/"
OG_IMAGE = "/images/poddy-acquired-og-wide.webp"


def load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def human_duration(value):
    try:
        total = max(0, int(float(value)))
    except (TypeError, ValueError):
        return ""
    hours, remainder = divmod(total, 3600)
    minutes = remainder // 60
    return f"{hours} hr {minutes} min" if hours else f"{minutes} min"


def iso_duration(value):
    try:
        total = max(0, int(float(value)))
    except (TypeError, ValueError):
        return None
    hours, remainder = divmod(total, 3600)
    minutes, seconds = divmod(remainder, 60)
    parts = ["PT"]
    if hours:
        parts.append(f"{hours}H")
    if minutes:
        parts.append(f"{minutes}M")
    if seconds or len(parts) == 1:
        parts.append(f"{seconds}S")
    return "".join(parts)


def effective_duration(feed_duration, transcript):
    """Prefer the transcribed media's actual end when dynamic ads extend the RSS runtime."""
    try:
        duration = max(0.0, float(feed_duration))
    except (TypeError, ValueError):
        duration = 0.0
    for collection_name in ("segments", "paragraphs"):
        for item in transcript.get(collection_name) or []:
            try:
                duration = max(duration, float(item.get("end") or 0))
            except (TypeError, ValueError):
                continue
    return int(round(duration))


def display_date(value):
    try:
        return parsedate_to_datetime(value).strftime("%B %-d, %Y")
    except (TypeError, ValueError, OverflowError):
        return value or ""


def iso_date(value):
    try:
        return parsedate_to_datetime(value).isoformat()
    except (TypeError, ValueError, OverflowError):
        return None


def timestamp_seconds(value):
    try:
        parts = [int(part) for part in str(value).split(":")]
    except ValueError:
        return 0
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    return 0


def format_timestamp(value):
    total = max(0, int(float(value or 0)))
    hours, remainder = divmod(total, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours}:{minutes:02d}:{seconds:02d}" if hours else f"{minutes}:{seconds:02d}"


def overview_paragraphs(summary):
    overview = summary.get("overview") or []
    return overview if isinstance(overview, list) else [overview]


def summary_description(title):
    return (
        f"Read an Acquired podcast summary of {title}, with five key insights, "
        "chapter timestamps, audio, and a searchable full transcript."
    )


def render_episode_page(ep, summary, transcript):
    title = ep.get("title") or "Acquired episode"
    slug = ep.get("slug") or "episode"
    episode_url = f"/poddy-summaries/episodes/{slug}/"
    description = summary_description(title)
    paragraphs = transcript.get("paragraphs") or []
    overview_html = "".join(
        f"<p>{escape(str(paragraph))}</p>" for paragraph in overview_paragraphs(summary)
    )

    takeaway_items = []
    for takeaway in summary.get("takeaways") or []:
        if isinstance(takeaway, dict):
            takeaway_items.append(
                "<li><strong>"
                + escape(str(takeaway.get("title") or "Key insight"))
                + "</strong><span>"
                + escape(str(takeaway.get("detail") or ""))
                + "</span></li>"
            )
        else:
            takeaway_items.append(f"<li><span>{escape(str(takeaway))}</span></li>")

    chapter_items = []
    for index, chapter in enumerate(summary.get("chapters") or [], start=1):
        timestamp = chapter.get("timestamp") or "0:00"
        quote = chapter.get("quote") or ""
        quote_html = f"<q>{escape(str(quote))}</q>" if quote else ""
        chapter_items.append(
            '<li><button class="chapter-card" type="button" '
            f'data-seek="{timestamp_seconds(timestamp)}" '
            f'aria-label="Play chapter {index} from {escape(str(timestamp), quote=True)}">'
            f'<span class="chapter-time">{escape(str(timestamp))}</span>'
            '<span class="chapter-copy">'
            f'<strong>{escape(str(chapter.get("title") or f"Chapter {index}"))}</strong>'
            f'<span>{escape(str(chapter.get("summary") or ""))}</span>'
            f"{quote_html}</span></button></li>"
        )

    transcript_items = []
    for paragraph in paragraphs:
        start = paragraph.get("start") or 0
        transcript_items.append(
            '<article class="transcript-segment">'
            f'<button type="button" data-seek="{int(float(start))}" '
            f'aria-label="Play from {format_timestamp(start)}">{format_timestamp(start)}</button>'
            f'<p>{escape(str(paragraph.get("text") or ""))}</p></article>'
        )

    episode_schema = {
        "@type": "PodcastEpisode",
        "@id": f"{SITE_URL}{episode_url}#episode",
        "name": title,
        "description": " ".join(str(value) for value in overview_paragraphs(summary)),
        "url": f"{SITE_URL}{episode_url}",
        "datePublished": iso_date(ep.get("pubDate")),
        "duration": iso_duration(ep.get("duration")),
        "associatedMedia": {
            "@type": "MediaObject",
            "contentUrl": ep.get("audioUrl"),
            "encodingFormat": "audio/mpeg",
        },
        "partOfSeries": {
            "@type": "PodcastSeries",
            "name": "Acquired",
            "url": PODCAST_URL,
        },
        "mainEntityOfPage": f"{SITE_URL}{episode_url}",
        "isBasedOn": ep.get("sourceUrl") or PODCAST_URL,
        "keywords": [
            "Acquired podcast summary",
            "Acquired podcast transcript",
            title,
        ],
    }
    episode_schema = {key: value for key, value in episode_schema.items() if value is not None}
    structured = {
        "@context": "https://schema.org",
        "@graph": [
            episode_schema,
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": 1,
                        "name": "Home",
                        "item": f"{SITE_URL}/",
                    },
                    {
                        "@type": "ListItem",
                        "position": 2,
                        "name": "Acquired Podcast Summaries",
                        "item": f"{SITE_URL}/poddy-summaries/",
                    },
                    {
                        "@type": "ListItem",
                        "position": 3,
                        "name": title,
                        "item": f"{SITE_URL}{episode_url}",
                    },
                ],
            },
        ],
    }
    json_ld = json.dumps(structured, ensure_ascii=False).replace("</", "<\\/")
    front_title = f"{title}: Acquired Podcast Summary & Transcript"

    return f'''---
layout: default
title: {json.dumps(front_title, ensure_ascii=False)}
description: {json.dumps(description, ensure_ascii=False)}
permalink: {episode_url}
image:
  path: {OG_IMAGE}
  width: 1200
  height: 630
  alt: {json.dumps(f"{title} Acquired podcast summary and transcript", ensure_ascii=False)}
date: {iso_date(ep.get("pubDate")) or ""}
---

<link rel="stylesheet" href="/poddy-summaries/styles.css" />
<script type="application/ld+json">{json_ld}</script>

<article class="poddy-page poddy-episode-detail">
  <a class="episode-back" href="/poddy-summaries/">← All Acquired podcast summaries</a>
  <header class="episode-detail-header">
    <p class="eyebrow">Acquired podcast summary</p>
    <h1>{escape(title)}</h1>
    <p class="episode-byline"><span>{escape(display_date(ep.get("pubDate")))}</span><span aria-hidden="true">·</span><span>{escape(human_duration(ep.get("duration")))}</span></p>
    <p class="episode-disclaimer">An independent reading companion to the Acquired podcast.</p>
    <a class="episode-source-link" href="{escape(str(ep.get("sourceUrl") or PODCAST_URL), quote=True)}" target="_blank" rel="noopener">View the original episode on Acquired ↗</a>
  </header>

  <audio class="episode-native-audio" id="episode-audio" controls preload="metadata" src="{escape(str(ep.get("audioUrl") or ""), quote=True)}"></audio>
  <nav class="episode-jump-nav" aria-label="On this page">
    <a href="#summary">Summary</a><a href="#insights">Key insights</a><a href="#chapters">Chapters</a><a href="#transcript">Transcript</a>
  </nav>

  <section class="episode-content-section" id="summary">
    <p class="content-label">In brief</p>
    <div class="summary-lead">{overview_html}</div>
  </section>

  <section class="episode-content-section" id="insights">
    <p class="content-label">Five key insights</p>
    <ol class="takeaway-list">{''.join(takeaway_items)}</ol>
  </section>

  <section class="episode-content-section" id="chapters">
    <div class="chapter-intro"><div><p class="eyebrow">Chapters</p><h2>Jump to the important parts.</h2></div><p>Select any timestamp to start the episode there.</p></div>
    <ol class="chapter-list">{''.join(chapter_items)}</ol>
  </section>

  <section class="episode-content-section" id="transcript">
    <div class="transcript-tools"><div><p class="eyebrow">Full transcript</p><h2>Paragraph by paragraph.</h2></div><p>{len(paragraphs):,} timestamped paragraphs. Use Control-F or Command-F to search.</p></div>
    <div class="transcript-box">{''.join(transcript_items)}</div>
  </section>
</article>

<script src="/poddy-summaries/episode.js" defer></script>
'''


def render_directory(episodes):
    items = []
    structured_items = []
    for position, episode in enumerate(episodes, start=1):
        url = f"/poddy-summaries/episodes/{episode['slug']}/"
        items.append(
            f'<a class="episode-directory-card" href="{url}">'
            f'<time>{escape(display_date(episode.get("pubDate")))}</time>'
            f'<h3>{escape(str(episode.get("title") or "Acquired episode"))}</h3>'
            '<span>Summary, key insights, chapters, and transcript →</span></a>'
        )
        structured_items.append(
            {
                "@type": "ListItem",
                "position": position,
                "url": f"{SITE_URL}{url}",
                "name": episode.get("title"),
            }
        )
    structured = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "Acquired Podcast Summaries and Transcripts",
        "description": "Independent summaries, key insights, chapter timestamps, and searchable transcripts for the Acquired podcast.",
        "url": f"{SITE_URL}/poddy-summaries/",
        "mainEntity": {"@type": "ItemList", "itemListElement": structured_items},
        "about": {"@type": "PodcastSeries", "name": "Acquired", "url": PODCAST_URL},
    }
    json_ld = json.dumps(structured, ensure_ascii=False).replace("</", "<\\/")
    return f'''<section class="episode-directory" aria-labelledby="episode-directory-title">
  <div class="section-heading">
    <h2 class="section-title">Archive</h2>
    <div><p class="section-kicker" id="episode-directory-title">Acquired episode summaries</p><p class="episode-directory-intro">{len(episodes)} complete guides, newest first. Each page includes the summary, key insights, chapters, and full transcript.</p></div>
  </div>
  <div class="episode-directory-list">{''.join(items)}</div>
</section>
<script type="application/ld+json">{json_ld}</script>
'''


def write_static_pages(episodes, data_dir):
    poddy_dir = data_dir.parents[1]
    generated_pages_dir = poddy_dir / "episodes"
    generated_pages_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    for episode in episodes:
        summary_path = data_dir / str(episode.get("summaryPath") or "")
        transcript_path = data_dir / str(episode.get("transcriptJsonPath") or "")
        summary = load_json(summary_path, {})
        transcript = load_json(transcript_path, {})
        if not summary or not transcript:
            continue
        slug = episode["slug"]
        page_dir = generated_pages_dir / slug
        page_dir.mkdir(parents=True, exist_ok=True)
        (page_dir / "index.html").write_text(
            render_episode_page(episode, summary, transcript), encoding="utf-8"
        )
        written += 1

    directory_path = poddy_dir.parent / "_includes" / "poddy-episode-directory.html"
    directory_path.write_text(render_directory(episodes), encoding="utf-8")
    return written, directory_path


def refresh_existing_episodes(episodes, data_dir):
    refreshed = []
    for episode in episodes:
        current = dict(episode)
        summary = load_json(data_dir / str(current.get("summaryPath") or ""), {})
        transcript = load_json(
            data_dir / str(current.get("transcriptJsonPath") or ""), {}
        )
        if summary:
            current["overview"] = summary.get("overview") or ""
            current["takeaways"] = summary.get("takeaways") or []
            current["chapters"] = summary.get("chapters") or []
        if transcript:
            current["duration"] = effective_duration(current.get("duration"), transcript)
        refreshed.append(current)
    return refreshed


def main():
    parser = argparse.ArgumentParser(description="Rebuild episodes.json for UI")
    parser.add_argument("--feed", help="RSS feed URL")
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Regenerate static pages from the existing episodes.json without fetching RSS",
    )
    parser.add_argument(
        "--data-dir",
        default=str(Path(__file__).resolve().parents[1] / "data" / "acquired"),
        help="Base data directory",
    )
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    summaries_dir = data_dir / "summaries"
    transcripts_dir = data_dir / "transcripts"
    state_path = data_dir / "state.json"
    episodes_path = data_dir / "episodes.json"

    if args.offline:
        existing_episodes = refresh_existing_episodes(
            load_json(episodes_path, []), data_dir
        )
        episodes_path.write_text(
            json.dumps(existing_episodes, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        written, directory_path = write_static_pages(existing_episodes, data_dir)
        print(
            f"Refreshed {episodes_path}, {written} episode pages, and "
            f"{directory_path} from existing data"
        )
        return
    if not args.feed:
        parser.error("--feed is required unless --offline is used")

    state = load_json(state_path, {"processed": []})
    processed = set(state.get("processed", []))

    feed_data = parse_feed(args.feed).get("episodes", [])

    episodes_out = []
    for ep in feed_data:
        if str(ep.get("guid")) not in processed:
            continue
        slug = ep.get("slug") or ""
        summary_path = summaries_dir / f"{slug}.json"
        transcript_txt_path = transcripts_dir / f"{slug}.txt"
        transcript_json_path = transcripts_dir / f"{slug}.json"
        if not summary_path.exists() or not transcript_json_path.exists():
            continue
        summary = load_json(summary_path, {})
        transcript = load_json(transcript_json_path, {})
        episode_url = f"/poddy-summaries/episodes/{slug}/"
        duration = effective_duration(ep.get("duration"), transcript)

        episodes_out.append(
            {
                "slug": slug,
                "guid": ep.get("guid"),
                "title": ep.get("title"),
                "pubDate": ep.get("pubDate"),
                "audioUrl": ep.get("audioUrl"),
                "sourceUrl": ep.get("sourceUrl"),
                "duration": duration,
                "publishedTs": ep.get("published_ts", 0),
                "episodeUrl": episode_url,
                "summaryPath": str(summary_path.relative_to(data_dir)),
                "transcriptPath": str(transcript_txt_path.relative_to(data_dir)) if transcript_txt_path.exists() else "",
                "transcriptJsonPath": str(transcript_json_path.relative_to(data_dir)),
                "overview": summary.get("overview") or "",
                "takeaways": summary.get("takeaways") or [],
                "chapters": summary.get("chapters") or summary.get("bullets") or [],
                "bullets": summary.get("bullets") or summary.get("chapters") or [],
            }
        )

    episodes_out.sort(key=lambda e: e.get("publishedTs", 0), reverse=True)
    for episode in episodes_out:
        episode.pop("publishedTs", None)
    episodes_path.write_text(json.dumps(episodes_out, ensure_ascii=False, indent=2), encoding="utf-8")
    written, directory_path = write_static_pages(episodes_out, data_dir)
    print(
        f"Wrote {episodes_path}, {written} episode pages, and {directory_path}"
    )


if __name__ == "__main__":
    main()
