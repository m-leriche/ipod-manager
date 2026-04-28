import { useEffect, useCallback, useRef } from "react";
import { usePlayback, usePlaybackTime } from "../../../contexts/PlaybackContext";
import { NowPlayingInfo } from "../../molecules/NowPlayingInfo/NowPlayingInfo";
import { TransportControls } from "../../molecules/TransportControls/TransportControls";
import { VolumeControl } from "../../molecules/VolumeControl/VolumeControl";

export const NowPlayingBar = () => {
  const { state, pause, resume, next, previous, seekTo, setVolume, toggleShuffle, cycleRepeat, clearPlaybackError } =
    usePlayback();
  const { currentTime, duration } = usePlaybackTime();

  // Use a ref for time values in the keyboard handler to avoid re-registering 60x/sec
  const timeRef = useRef({ currentTime, duration });
  timeRef.current = { currentTime, duration };

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

      const t = timeRef.current;
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
            const newFrac = Math.max(0, (t.currentTime - 10) / t.duration);
            seekTo(newFrac);
          }
          break;
        case "ArrowRight":
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            next();
          } else {
            e.preventDefault();
            const newFrac = Math.min(1, (t.currentTime + 10) / t.duration);
            seekTo(newFrac);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.currentTrack, handlePlayPause, previous, next, seekTo]);

  // Auto-clear playback error after 5 seconds
  useEffect(() => {
    if (!state.playbackError) return;
    const timer = setTimeout(() => clearPlaybackError(), 5000);
    return () => clearTimeout(timer);
  }, [state.playbackError, clearPlaybackError]);

  if (!state.currentTrack) return null;

  return (
    <div className="h-[72px] border-t border-border bg-bg-secondary px-6 flex items-center gap-4 shrink-0">
      {/* Left — Now Playing Info or error */}
      <div className="w-[240px] shrink-0">
        {state.playbackError ? (
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-red-400 shrink-0">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <span className="text-[11px] text-red-400 font-medium leading-tight">{state.playbackError}</span>
          </div>
        ) : (
          <NowPlayingInfo track={state.currentTrack} />
        )}
      </div>

      {/* Center — Transport Controls */}
      <div className="flex-1 flex justify-center">
        <TransportControls
          isPlaying={state.isPlaying}
          currentTime={currentTime}
          duration={duration}
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
