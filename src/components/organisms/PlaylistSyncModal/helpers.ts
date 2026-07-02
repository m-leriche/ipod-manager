/** Stable selection key: regular playlists are `p:{id}`, smart are `s:{id}`. */
export const playlistKey = (id: number, isSmart: boolean): string => (isSmart ? `s:${id}` : `p:${id}`);

/** Split a selection of keys back into the two id lists the backend expects. */
export const splitSelection = (selected: Set<string>): { playlistIds: number[]; smartPlaylistIds: number[] } => {
  const playlistIds: number[] = [];
  const smartPlaylistIds: number[] = [];
  for (const key of selected) {
    const id = Number(key.slice(2));
    if (key.startsWith("s:")) smartPlaylistIds.push(id);
    else playlistIds.push(id);
  }
  return { playlistIds, smartPlaylistIds };
};
