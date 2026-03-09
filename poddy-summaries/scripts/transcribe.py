#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
import mlx_whisper


MODEL_PATH = "mlx-community/whisper-large-v3-turbo"


def main():
    parser = argparse.ArgumentParser(description="Transcribe audio with MLX Whisper")
    parser.add_argument("--audio", required=True, help="Path to audio file")
    parser.add_argument("--slug", required=True, help="Slug for output files")
    parser.add_argument("--title", default="", help="Episode title")
    parser.add_argument(
        "--data-dir",
        default=str(Path(__file__).resolve().parents[1] / "data" / "acquired"),
        help="Base data directory",
    )
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    transcripts_dir = data_dir / "transcripts"
    transcripts_dir.mkdir(parents=True, exist_ok=True)

    result = mlx_whisper.transcribe(
        args.audio,
        path_or_hf_repo=MODEL_PATH,
        word_timestamps=True,
    )

    text_path = transcripts_dir / f"{args.slug}.txt"
    json_path = transcripts_dir / f"{args.slug}.json"
    timed_path = transcripts_dir / f"{args.slug}-timed.txt"

    text_path.write_text(result.get("text", ""), encoding="utf-8")

    segments = [
        {
            "start": seg.get("start"),
            "end": seg.get("end"),
            "text": seg.get("text", ""),
        }
        for seg in result.get("segments", [])
    ]

    meta = {
        "title": args.title,
        "slug": args.slug,
        "language": result.get("language"),
        "segments": segments,
    }
    json_path.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Generate timed transcript with inline [MM:SS] timestamps
    timed_parts = []
    for seg in segments:
        start_secs = seg.get("start", 0) or 0
        mins = int(start_secs // 60)
        secs = int(start_secs % 60)
        ts = f"[{mins:02d}:{secs:02d}]"
        text = seg.get("text", "").strip()
        if text:
            timed_parts.append(f"{ts} {text}")
    timed_path.write_text(" ".join(timed_parts), encoding="utf-8")

    print(f"Wrote transcript: {text_path}")
    print(f"Wrote segments: {json_path}")
    print(f"Wrote timed transcript: {timed_path}")


if __name__ == "__main__":
    main()
