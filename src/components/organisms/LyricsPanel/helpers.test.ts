import { describe, it, expect } from "vitest";
import { parseLrc, findActiveLine } from "./helpers";

describe("parseLrc", () => {
  it("parses standard LRC lines", () => {
    const lrc = "[00:12.34] Hello world\n[00:15.00] Second line";
    const lines = parseLrc(lrc);
    expect(lines).toHaveLength(2);
    expect(lines[0].time).toBeCloseTo(12.34, 1);
    expect(lines[0].text).toBe("Hello world");
    expect(lines[1].time).toBeCloseTo(15.0, 1);
    expect(lines[1].text).toBe("Second line");
  });

  it("parses three-digit milliseconds", () => {
    const lrc = "[01:23.456] Test line";
    const lines = parseLrc(lrc);
    expect(lines).toHaveLength(1);
    expect(lines[0].time).toBeCloseTo(83.456, 2);
  });

  it("handles empty lines in LRC", () => {
    const lrc = "[00:05.00] Line one\n[00:10.00] \n[00:15.00] Line three";
    const lines = parseLrc(lrc);
    expect(lines).toHaveLength(3);
    expect(lines[1].text).toBe("");
  });

  it("ignores non-LRC lines", () => {
    const lrc = "[ti:Song Title]\n[ar:Artist]\n[00:05.00] Actual lyrics";
    const lines = parseLrc(lrc);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Actual lyrics");
  });

  it("returns empty array for empty input", () => {
    expect(parseLrc("")).toEqual([]);
  });

  it("returns empty array for non-LRC text", () => {
    expect(parseLrc("just plain text\nno timestamps")).toEqual([]);
  });

  it("handles minutes > 9", () => {
    const lrc = "[12:30.00] Late in the song";
    const lines = parseLrc(lrc);
    expect(lines).toHaveLength(1);
    expect(lines[0].time).toBeCloseTo(12 * 60 + 30, 1);
  });
});

describe("findActiveLine", () => {
  const lines = [
    { time: 0, text: "Intro" },
    { time: 5, text: "Line 1" },
    { time: 10, text: "Line 2" },
    { time: 15, text: "Line 3" },
  ];

  it("returns -1 before any line starts", () => {
    // All lines start at time >= 0, so at time -1 no line is active
    expect(findActiveLine(lines, -1)).toBe(-1);
  });

  it("returns 0 at time 0", () => {
    expect(findActiveLine(lines, 0)).toBe(0);
  });

  it("returns the correct active line mid-song", () => {
    expect(findActiveLine(lines, 7)).toBe(1);
    expect(findActiveLine(lines, 10)).toBe(2);
    expect(findActiveLine(lines, 12)).toBe(2);
  });

  it("returns last line after all timestamps", () => {
    expect(findActiveLine(lines, 100)).toBe(3);
  });

  it("returns -1 for empty lines array", () => {
    expect(findActiveLine([], 5)).toBe(-1);
  });
});
