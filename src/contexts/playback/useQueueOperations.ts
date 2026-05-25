import { useCallback } from "react";
import type React from "react";
import type { LibraryTrack } from "../../types/library";
import type { PlaybackState, RepeatMode } from "./types";
import { shuffleIndices } from "./helpers";

export const useQueueOperations = (
  setState: React.Dispatch<React.SetStateAction<PlaybackState>>,
  shuffleOrderRef: React.MutableRefObject<number[]>,
  shufflePositionRef: React.MutableRefObject<number>,
) => {
  const addToQueue = useCallback(
    (tracks: LibraryTrack[]) => {
      setState((prev) => ({
        ...prev,
        queue: [...prev.queue, ...tracks],
      }));
    },
    [setState],
  );

  const playNext = useCallback(
    (tracks: LibraryTrack[]) => {
      setState((prev) => {
        const insertAt = prev.queueIndex + 1;
        const newQueue = [...prev.queue];
        newQueue.splice(insertAt, 0, ...tracks);
        return { ...prev, queue: newQueue };
      });
    },
    [setState],
  );

  const removeFromQueue = useCallback(
    (index: number) => {
      setState((prev) => {
        const newQueue = prev.queue.filter((_, i) => i !== index);
        let newIndex = prev.queueIndex;
        if (index < prev.queueIndex) newIndex -= 1;
        else if (index === prev.queueIndex) newIndex = -1;
        return { ...prev, queue: newQueue, queueIndex: newIndex };
      });
    },
    [setState],
  );

  const reorderQueue = useCallback(
    (fromIndex: number, toIndex: number) => {
      setState((prev) => {
        const newQueue = [...prev.queue];
        const [moved] = newQueue.splice(fromIndex, 1);
        newQueue.splice(toIndex, 0, moved);

        let newIndex = prev.queueIndex;
        if (fromIndex === prev.queueIndex) {
          newIndex = toIndex;
        } else {
          if (fromIndex < prev.queueIndex && toIndex >= prev.queueIndex) newIndex -= 1;
          if (fromIndex > prev.queueIndex && toIndex <= prev.queueIndex) newIndex += 1;
        }

        return { ...prev, queue: newQueue, queueIndex: newIndex };
      });
    },
    [setState],
  );

  const clearQueue = useCallback(() => {
    setState((prev) => ({
      ...prev,
      queue: prev.currentTrack ? [prev.currentTrack] : [],
      queueIndex: prev.currentTrack ? 0 : -1,
    }));
  }, [setState]);

  const toggleShuffle = useCallback(() => {
    setState((prev) => {
      const newShuffle = !prev.shuffle;
      if (newShuffle && prev.queue.length > 0) {
        shuffleOrderRef.current = shuffleIndices(prev.queue.length, prev.queueIndex);
        shufflePositionRef.current = 0;
      }
      return { ...prev, shuffle: newShuffle };
    });
  }, [setState, shuffleOrderRef, shufflePositionRef]);

  const cycleRepeat = useCallback(() => {
    setState((prev) => {
      const modes: RepeatMode[] = ["off", "all", "one"];
      const nextIdx = (modes.indexOf(prev.repeat) + 1) % modes.length;
      return { ...prev, repeat: modes[nextIdx] };
    });
  }, [setState]);

  return { addToQueue, playNext, removeFromQueue, reorderQueue, clearQueue, toggleShuffle, cycleRepeat };
};
