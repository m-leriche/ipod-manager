import type { SyncedLine } from "./types";

/**
 * Parse LRC format timestamps into an array of { time, text } objects.
 * Supports standard LRC: [mm:ss.xx] text
 */
export const parseLrc = (lrc: string): SyncedLine[] => {
  const lines: SyncedLine[] = [];
  const regex = /\[(\d{1,3}):(\d{2})\.(\d{2,3})\]\s*(.*)/;

  for (const raw of lrc.split("\n")) {
    const match = raw.match(regex);
    if (!match) continue;

    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const ms = match[3].length === 2 ? parseInt(match[3], 10) * 10 : parseInt(match[3], 10);
    const time = minutes * 60 + seconds + ms / 1000;
    const text = match[4].trim();

    lines.push({ time, text });
  }

  return lines;
};

/**
 * Find the index of the active line given the current playback time.
 * Returns -1 if no line is active yet.
 */
export const findActiveLine = (lines: SyncedLine[], currentTime: number): number => {
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= currentTime) {
      active = i;
    } else {
      break;
    }
  }
  return active;
};
