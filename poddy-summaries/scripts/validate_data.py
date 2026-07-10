#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def timestamp_seconds(value):
    parts = [int(part) for part in str(value).split(":")]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    raise ValueError(f"Invalid timestamp: {value}")


def main():
    parser = argparse.ArgumentParser(description="Validate Poddy episode artifacts")
    parser.add_argument(
        "--data-dir",
        default=str(Path(__file__).resolve().parents[1] / "data" / "acquired"),
    )
    args = parser.parse_args()
    data_dir = Path(args.data_dir)
    poddy_dir = data_dir.parents[1]
    episodes = load(data_dir / "episodes.json")
    errors = []

    for episode in episodes:
        slug = episode.get("slug") or "<missing-slug>"
        expected_url = f"/poddy-summaries/episodes/{slug}/"
        if episode.get("episodeUrl") != expected_url:
            errors.append(f"{slug}: permanent episode URL is missing or incorrect")
        if not str(episode.get("sourceUrl") or "").startswith("https://"):
            errors.append(f"{slug}: original episode source URL is missing")
        try:
            summary = load(data_dir / episode["summaryPath"])
            transcript = load(data_dir / episode["transcriptJsonPath"])
        except (KeyError, FileNotFoundError, json.JSONDecodeError) as error:
            errors.append(f"{slug}: unreadable artifact: {error}")
            continue

        overview = summary.get("overview")
        if not isinstance(overview, list) or len(overview) != 2 or not all(overview):
            errors.append(f"{slug}: overview must contain exactly two paragraphs")
        takeaways = summary.get("takeaways")
        if not isinstance(takeaways, list) or len(takeaways) != 5:
            errors.append(f"{slug}: must contain exactly five takeaways")
        elif not all(
            isinstance(item, dict) and item.get("title") and item.get("detail")
            for item in takeaways
        ):
            errors.append(f"{slug}: malformed takeaway")

        chapters = summary.get("chapters")
        if not isinstance(chapters, list) or not 8 <= len(chapters) <= 12:
            errors.append(f"{slug}: must contain 8–12 chapters")
        else:
            try:
                chapter_times = [timestamp_seconds(item["timestamp"]) for item in chapters]
                duration = int(float(episode.get("duration") or 0))
                if chapter_times != sorted(chapter_times):
                    errors.append(f"{slug}: chapter timestamps are not ordered")
                if duration and chapter_times[-1] > duration + 30:
                    errors.append(f"{slug}: final chapter exceeds episode duration")
                if duration and chapter_times[0] > duration * 0.2:
                    errors.append(f"{slug}: chapters do not cover the beginning")
                if duration and chapter_times[-1] < duration * 0.75:
                    errors.append(f"{slug}: chapters do not reach the final quarter")
            except (KeyError, TypeError, ValueError) as error:
                errors.append(f"{slug}: invalid chapter timestamp: {error}")

        paragraphs = transcript.get("paragraphs")
        if not isinstance(paragraphs, list) or not paragraphs:
            errors.append(f"{slug}: transcript has no paragraphs")
        else:
            starts = [float(item.get("start") or 0) for item in paragraphs]
            if starts != sorted(starts):
                errors.append(f"{slug}: transcript timestamps are not ordered")
            if not all(str(item.get("text") or "").strip() for item in paragraphs):
                errors.append(f"{slug}: transcript contains an empty paragraph")

        page_path = poddy_dir / "episodes" / slug / "index.html"
        if not page_path.exists():
            errors.append(f"{slug}: permanent episode page is missing")
        else:
            page = page_path.read_text(encoding="utf-8")
            if "PodcastEpisode" not in page or str(episode.get("title")) not in page:
                errors.append(f"{slug}: permanent page lacks structured episode content")

    if errors:
        print("\n".join(f"ERROR {error}" for error in errors))
        raise SystemExit(1)
    print(f"Validated {len(episodes)} Acquired episode guides and permanent pages")


if __name__ == "__main__":
    main()
