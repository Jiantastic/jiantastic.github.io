#!/usr/bin/env python3
import json
import tempfile
import unittest
from pathlib import Path

from build_episodes import effective_duration, refresh_existing_episodes
from feed_fetch import canonical_source_url, slugify
from validate_data import chapter_bounds


class PipelineHelpersTest(unittest.TestCase):
    def test_slugify_normalizes_accents_and_apostrophes(self):
        cases = {
            "Hermès": "hermes",
            "Trader Joe’s": "trader-joes",
            "L'Oréal": "loreal",
            "Novo Nordisk (Ozempic)": "novo-nordisk-ozempic",
        }
        for title, expected in cases.items():
            with self.subTest(title=title):
                self.assertEqual(slugify(title), expected)

    def test_canonical_source_url_repairs_generic_legacy_feed_links(self):
        self.assertEqual(
            canonical_source_url(
                "http://acquired.fm/", "the-playbook-lessons-from-200-company-stories"
            ),
            "https://www.acquired.fm/episodes/the-playbook-lessons-from-200-company-stories",
        )
        self.assertEqual(
            canonical_source_url(
                "https://www.acquired.fm/episodes/walmart", "walmart"
            ),
            "https://www.acquired.fm/episodes/walmart",
        )

    def test_effective_duration_uses_transcribed_media_end(self):
        transcript = {
            "segments": [{"end": 120.4}, {"end": 135.6}],
            "paragraphs": [{"end": 134.0}],
        }
        self.assertEqual(effective_duration("100", transcript), 136)

    def test_effective_duration_keeps_longer_feed_runtime(self):
        transcript = {"segments": [{"end": 100.0}], "paragraphs": []}
        self.assertEqual(effective_duration("125", transcript), 125)

    def test_chapter_bounds_follow_runtime(self):
        self.assertEqual(chapter_bounds(300), (1, 3))
        self.assertEqual(chapter_bounds(301), (3, 6))
        self.assertEqual(chapter_bounds(1800), (3, 6))
        self.assertEqual(chapter_bounds(1801), (8, 12))

    def test_offline_refresh_rehydrates_interactive_episode_data(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "summaries").mkdir()
            (root / "transcripts").mkdir()
            (root / "summaries/example.json").write_text(
                json.dumps(
                    {
                        "overview": ["One", "Two"],
                        "takeaways": [{"title": "Claim", "detail": "Evidence"}],
                        "chapters": [{"title": "Start", "timestamp": "0:00"}],
                    }
                )
            )
            (root / "transcripts/example.json").write_text(
                json.dumps({"segments": [{"end": 145.6}], "paragraphs": []})
            )
            episodes = [
                {
                    "slug": "example",
                    "duration": 100,
                    "summaryPath": "summaries/example.json",
                    "transcriptJsonPath": "transcripts/example.json",
                    "overview": [],
                    "takeaways": [],
                    "chapters": [],
                }
            ]

            refreshed = refresh_existing_episodes(episodes, root)

            self.assertEqual(refreshed[0]["overview"], ["One", "Two"])
            self.assertEqual(refreshed[0]["takeaways"][0]["title"], "Claim")
            self.assertEqual(refreshed[0]["chapters"][0]["title"], "Start")
            self.assertEqual(refreshed[0]["duration"], 146)


if __name__ == "__main__":
    unittest.main()
