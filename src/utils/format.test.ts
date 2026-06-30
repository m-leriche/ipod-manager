import { describe, it, expect } from "vitest";
import { formatDuration, formatDurationLong, formatBytes } from "./format";

describe("formatDuration", () => {
  it("formats minutes and seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(599)).toBe("9:59");
  });

  it("promotes to hours past 60 minutes", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("floors fractional seconds", () => {
    expect(formatDuration(65.9)).toBe("1:05");
  });

  it("returns the invalid sentinel for bad input", () => {
    expect(formatDuration(NaN)).toBe("—");
    expect(formatDuration(-1)).toBe("—");
    expect(formatDuration(Infinity)).toBe("—");
    expect(formatDuration(NaN, "0:00")).toBe("0:00");
  });
});

describe("formatDurationLong", () => {
  it("formats minutes only under an hour", () => {
    expect(formatDurationLong(0)).toBe("0m");
    expect(formatDurationLong(125)).toBe("2m");
  });

  it("includes hours and days as needed", () => {
    expect(formatDurationLong(3661)).toBe("1h 1m");
    expect(formatDurationLong(90000)).toBe("1d 1h 0m");
  });

  it("treats invalid input as zero", () => {
    expect(formatDurationLong(NaN)).toBe("0m");
    expect(formatDurationLong(-5)).toBe("0m");
  });
});

describe("formatBytes", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats kilo/mega/giga/tera", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(2 * 1024 ** 3)).toBe("2.00 GB");
    expect(formatBytes(3 * 1024 ** 4)).toBe("3.00 TB");
  });
});
