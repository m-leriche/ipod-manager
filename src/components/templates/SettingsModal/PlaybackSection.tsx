import { usePlayback } from "../../../contexts/PlaybackContext";
import type { ReplayGainMode } from "../../../contexts/playback/types";
import { SettingGroup, SettingToggle } from "./SettingGroup";

export const PlaybackSection = () => {
  const { state: playbackState, setCrossfade, setReplayGain } = usePlayback();

  return (
    <>
      <SettingGroup
        title="Crossfade"
        description="Smoothly blend between tracks. Set to 0 for gapless playback with no overlap."
        first
      >
        <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-xl">
          <span className="text-[11px] text-text-tertiary shrink-0 w-8 text-right">
            {playbackState.crossfade === 0 ? "Off" : `${playbackState.crossfade}s`}
          </span>
          <input
            type="range"
            min={0}
            max={12}
            step={1}
            value={playbackState.crossfade}
            onChange={(e) => setCrossfade(Number(e.target.value))}
            className="flex-1 accent-accent h-1"
            data-testid="crossfade-slider"
          />
          <span className="text-[10px] text-text-tertiary shrink-0">12s</span>
        </div>
      </SettingGroup>

      <SettingGroup
        title="Volume Normalization"
        description="Adjust playback volume using ReplayGain tags so all tracks play at a consistent level. Does not modify your files."
      >
        <div className="flex flex-col gap-3 px-4 py-3 border border-border rounded-xl">
          <SettingToggle
            label="Enable ReplayGain"
            checked={playbackState.replayGainEnabled}
            onChange={(v) => setReplayGain(v)}
            testId="replay-gain-toggle"
          />

          {playbackState.replayGainEnabled && (
            <div className="flex flex-col gap-2 pl-6">
              <div className="flex items-center gap-4">
                {(["track", "album"] as ReplayGainMode[]).map((mode) => (
                  <label key={mode} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="replayGainMode"
                      value={mode}
                      checked={playbackState.replayGainMode === mode}
                      onChange={() => setReplayGain(true, mode)}
                      className="accent-accent w-3 h-3"
                    />
                    <span className="text-[11px] text-text-secondary capitalize">{mode} gain</span>
                  </label>
                ))}
              </div>
              <p className="text-[9px] text-text-tertiary leading-snug">
                Track: every song at the same level — best for shuffle. Album: preserves volume differences between
                songs on the same album — best for full-album listening.
              </p>
            </div>
          )}
        </div>
      </SettingGroup>
    </>
  );
};
