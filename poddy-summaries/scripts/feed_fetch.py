#!/usr/bin/env python3
import argparse
import json
import re
from time import mktime
import feedparser


def slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text or "episode"


def parse_feed(url: str):
    feed = feedparser.parse(url)
    if feed.bozo and not feed.entries:
        raise RuntimeError(f"Unable to parse podcast feed: {feed.bozo_exception}")
    episodes = []
    for entry in feed.entries:
        guid = entry.get("id") or entry.get("guid") or entry.get("link") or ""
        title = entry.get("title", "Untitled Episode")
        audio_url = None
        for link in entry.get("enclosures", []):
            if link.get("type", "").startswith("audio") and link.get("href"):
                audio_url = link["href"]
                break
        if not audio_url:
            audio_url = entry.get("link")
        published = entry.get("published") or entry.get("updated") or ""
        published_parsed = entry.get("published_parsed") or entry.get("updated_parsed")
        duration = entry.get("itunes_duration") or ""
        episodes.append(
            {
                "guid": str(guid),
                "title": title,
                "audioUrl": audio_url,
                "sourceUrl": entry.get("link") or "https://www.acquired.fm/episodes",
                "pubDate": published,
                "duration": duration,
                "slug": slugify(title),
                "published_ts": mktime(published_parsed) if published_parsed else 0,
            }
        )
    episodes.sort(key=lambda e: e.get("published_ts", 0), reverse=True)
    return {"episodes": episodes}


def main():
    parser = argparse.ArgumentParser(description="Fetch RSS feed episodes")
    parser.add_argument("--feed", required=True, help="RSS feed URL")
    args = parser.parse_args()
    data = parse_feed(args.feed)
    print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
