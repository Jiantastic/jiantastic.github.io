#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


MODEL_PATH = "mlx-community/whisper-large-v3-turbo"


def format_timestamp(seconds):
    total = max(0, int(seconds or 0))
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def build_paragraphs(segments, target_words=80, max_words=125, max_seconds=75):
    """Group short ASR segments into readable, seekable paragraphs."""
    paragraphs = []
    parts = []
    word_count = 0
    start = None
    end = None

    def flush():
        nonlocal parts, word_count, start, end
        if parts:
            paragraphs.append(
                {
                    "start": start or 0,
                    "end": end or start or 0,
                    "text": " ".join(parts),
                }
            )
        parts = []
        word_count = 0
        start = None
        end = None

    for segment in segments:
        text = " ".join(str(segment.get("text", "")).split())
        if not text:
            continue
        segment_start = segment.get("start") or 0
        segment_end = segment.get("end") or segment_start
        if start is None:
            start = segment_start
        end = segment_end
        parts.append(text)
        word_count += len(text.split())

        elapsed = max(0, end - start)
        ends_sentence = text.rstrip('"”’').endswith((".", "!", "?"))
        if (
            (word_count >= target_words and ends_sentence)
            or word_count >= max_words
            or elapsed >= max_seconds
        ):
            flush()

    flush()
    return paragraphs


def main():
    import mlx_whisper

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
    )

    text_path = transcripts_dir / f"{args.slug}.txt"
    json_path = transcripts_dir / f"{args.slug}.json"
    timed_path = transcripts_dir / f"{args.slug}-timed.txt"

    segments = [
        {
            "start": seg.get("start"),
            "end": seg.get("end"),
            "text": seg.get("text", ""),
        }
        for seg in result.get("segments", [])
    ]
    paragraphs = build_paragraphs(segments)

    text_path.write_text(
        "\n\n".join(paragraph["text"] for paragraph in paragraphs),
        encoding="utf-8",
    )

    meta = {
        "title": args.title,
        "slug": args.slug,
        "language": result.get("language"),
        "segments": segments,
        "paragraphs": paragraphs,
    }
    json_path.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # One timestamp per paragraph keeps model input and text exports readable.
    timed_parts = [
        f"[{format_timestamp(paragraph['start'])}] {paragraph['text']}"
        for paragraph in paragraphs
    ]
    timed_path.write_text("\n\n".join(timed_parts), encoding="utf-8")

    print(f"Wrote transcript: {text_path}")
    print(f"Wrote segments: {json_path}")
    print(f"Wrote timed transcript: {timed_path}")


if __name__ == "__main__":
    main()
