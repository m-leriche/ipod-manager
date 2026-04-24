import { describe, it, expect } from "vitest";
import { fmtBytes } from "./helpers";

describe("fmtBytes", () => {
  it("formats bytes", () => {
    expect(fmtBytes(0)).toBe("0 B");
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(1023)).toBe("1023 B");
  });

  it("formats kilobytes", () => {
    expect(fmtBytes(1024)).toBe("1.0 KB");
    expect(fmtBytes(1536)).toBe("1.5 KB");
    expect(fmtBytes(1048575)).toBe("1024.0 KB");
  });

  it("formats megabytes", () => {
    expect(fmtBytes(1048576)).toBe("1.0 MB");
    expect(fmtBytes(524288000)).toBe("500.0 MB");
  });

  it("formats gigabytes", () => {
    expect(fmtBytes(1073741824)).toBe("1.0 GB");
    expect(fmtBytes(119_100_000_000)).toBe("110.9 GB");
    expect(fmtBytes(1_000_000_000_000)).toBe("931.3 GB");
  });
});
