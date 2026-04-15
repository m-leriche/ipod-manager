import { useEffect, useCallback } from "react";
import { usePlayback } from "../../../contexts/PlaybackContext";
import { NowPlayingInfo } from "../../molecules/NowPlayingInfo/NowPlayingInfo";
import { TransportControls } from "../../molecules/TransportControls/TransportControls";
import { VolumeControl } from "../../molecules/VolumeControl/VolumeControl";

export const NowPlayingBar = () => {
  const { state, pause, resume, next, previous, seekTo, setVolume, toggleShuffle, cycleRepeat } = usePlayback();

  const handlePlayPause = useCallback(() => {
    if (state.isPlaying) pause();
    else resume();
  }, [state.isPlaying, pause, resume]);

  // Global keyboard shortcuts
  useEffect(() => {
    if (!state.currentTrack) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          handlePlayPause();
          break;
        case "ArrowLeft":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            previous();
          } else {
            e.preventDefault();
            const newFrac = Math.max(0, (state.currentTime - 10) / state.duration);
            seekTo(newFrac);
          }
          break;
        case "ArrowRight":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            next();
          } else {
            e.preventDefault();
            const newFrac = Math.min(1, (state.currentTime + 10) / state.duration);
            seekTo(newFrac);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.currentTrack, state.currentTime, state.duration, handlePlayPause, previous, next, seekTo]);

  if (!state.currentTrack) return null;

  return (
    <div className="h-[72px] border-t border-border bg-bg-secondary px-6 flex items-center gap-4 shrink-0">
      {/* Left — Now Playing Info */}
      <div className="w-[240px] shrink-0">
        <NowPlayingInfo track={state.currentTrack} />
      </div>

      {/* Center — Transport Controls */}
      <div className="flex-1 flex justify-center">
        <TransportControls
          isPlaying={state.isPlaying}
          currentTime={state.currentTime}
          duration={state.duration}
          shuffle={state.shuffle}
          repeat={state.repeat}
          onPlayPause={handlePlayPause}
          onNext={next}
          onPrevious={previous}
          onSeek={seekTo}
          onToggleShuffle={toggleShuffle}
          onCycleRepeat={cycleRepeat}
        />
      </div>

      {/* Right — Volume */}
      <div className="w-[200px] shrink-0 flex justify-end">
        <VolumeControl volume={state.volume} onChange={setVolume} />
      </div>
    </div>
  );
};
