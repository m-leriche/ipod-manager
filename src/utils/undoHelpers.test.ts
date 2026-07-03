import { describe, it, expect } from "vitest";
import { groupByPreviousValue } from "./undoHelpers";
import type { LibraryTrack } from "../types/library";

const track = (id: number, rating: number): LibraryTrack => ({ id, rating }) as LibraryTrack;

describe("groupByPreviousValue", () => {
  it("groups track ids by their current value", () => {
    const groups = groupByPreviousValue([track(1, 2), track(2, 4), track(3, 2)], (t) => t.rating, 5);
    expect(groups.get(2)).toEqual([1, 3]);
    expect(groups.get(4)).toEqual([2]);
  });

  it("skips tracks already at the new value", () => {
    const groups = groupByPreviousValue([track(1, 5), track(2, 3)], (t) => t.rating, 5);
    expect(groups.has(5)).toBe(false);
    expect(groups.get(3)).toEqual([2]);
  });

  it("returns an empty map when nothing changes", () => {
    expect(groupByPreviousValue([track(1, 5)], (t) => t.rating, 5).size).toBe(0);
  });
});
