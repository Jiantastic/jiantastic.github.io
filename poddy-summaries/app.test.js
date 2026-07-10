import { describe, expect, it } from "vitest";
import {
  formatDuration,
  formatEpisodeDate,
  formatTimestamp,
  groupTranscriptSegments,
  parseTimestamp,
} from "./app.js";

describe("Poddy helpers", () => {
  it("parses minute and hour timestamps", () => {
    expect(parseTimestamp("12:34")).toBe(754);
    expect(parseTimestamp("2:03:04")).toBe(7384);
    expect(parseTimestamp("not-a-time")).toBeNull();
    expect(parseTimestamp("1:75")).toBeNull();
  });

  it("formats podcast dates", () => {
    expect(formatEpisodeDate("Sun, 14 Dec 2025 20:19:45 -0800")).toBe("December 14, 2025");
    expect(formatEpisodeDate("unknown")).toBe("unknown");
  });

  it("formats player time and long episode duration", () => {
    expect(formatTimestamp(754)).toBe("12:34");
    expect(formatTimestamp(7384)).toBe("2:03:04");
    expect(formatDuration(10057)).toBe("2 hr 48 min");
  });

  it("groups short transcript segments into timestamped paragraphs", () => {
    const segments = [
      { start: 0, end: 8, text: "The first thought starts here." },
      { start: 8, end: 15, text: "It continues with useful context." },
      { start: 15, end: 25, text: "Then the idea reaches a conclusion." },
    ];
    const paragraphs = groupTranscriptSegments(segments, { targetWords: 10 });
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toMatchObject({ start: 0, end: 15 });
    expect(paragraphs[0].text).toContain("useful context");
  });
});
