import type { LibraryTrack } from "../types/library";

/**
 * Group track ids by a field's current value, skipping tracks already at
 * `newValue`. Each group becomes one restore call when undoing a bulk
 * rating or flag change.
 */
export const groupByPreviousValue = <V>(
  tracks: LibraryTrack[],
  getValue: (track: LibraryTrack) => V,
  newValue: V,
): Map<V, number[]> => {
  const groups = new Map<V, number[]>();
  for (const track of tracks) {
    const previous = getValue(track);
    if (previous === newValue) continue;
    const ids = groups.get(previous);
    if (ids) ids.push(track.id);
    else groups.set(previous, [track.id]);
  }
  return groups;
};
