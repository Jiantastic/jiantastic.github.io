#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from feed_fetch import parse_feed


def load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def main():
    parser = argparse.ArgumentParser(description="Rebuild episodes.json for UI")
    parser.add_argument("--feed", required=True, help="RSS feed URL")
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
        summary = load_json(summary_path, {})

        episodes_out.append(
            {
                "slug": slug,
                "guid": ep.get("guid"),
                "title": ep.get("title"),
                "pubDate": ep.get("pubDate"),
                "audioUrl": ep.get("audioUrl"),
                "duration": ep.get("duration"),
                "summaryPath": str(summary_path.relative_to(data_dir)),
                "transcriptPath": str(transcript_txt_path.relative_to(data_dir)),
                "bullets": summary.get("bullets") or summary.get("summary") or [],
            }
        )

    episodes_out.sort(key=lambda e: e.get("pubDate") or "", reverse=True)
    episodes_path.write_text(json.dumps(episodes_out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {episodes_path} with {len(episodes_out)} episodes")


if __name__ == "__main__":
    main()
