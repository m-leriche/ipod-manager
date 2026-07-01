import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useProgress } from "../../../contexts/ProgressContext";
import { cancelSync } from "../../../utils/cancelSync";
import { pickFolder } from "../../../utils/pickPath";
import { getSetting, setSetting } from "../../../utils/settings";
import { SettingGroup, SettingToggle } from "./SettingGroup";
import { UpdateSection } from "./UpdateSection";
import type { LibraryScanProgress } from "../../../types/library";

export const GeneralSection = ({
  onLibraryChanged,
  onReplayTour,
  autoCheckUpdate,
  onAutoCheckStarted,
}: {
  onLibraryChanged: () => void;
  onReplayTour: () => void;
  autoCheckUpdate?: boolean;
  onAutoCheckStarted?: () => void;
}) => {
  const [libraryLocation, setLibraryLocation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resumeQueue, setResumeQueue] = useState(() => getSetting("resumeQueueOnLaunch"));
  const [rememberTab, setRememberTab] = useState(() => getSetting("rememberLastTab"));
  const { start: startProgress, update: updateProgress, finish: finishProgress, fail: failProgress } = useProgress();

  useEffect(() => {
    invoke<string | null>("get_library_location")
      .then(setLibraryLocation)
      .finally(() => setLoading(false));
  }, []);

  const handleSetLibraryLocation = useCallback(async () => {
    const selected = await pickFolder("Choose library location");
    if (!selected) return;

    startProgress("Scanning library...", cancelSync);

    const unlisten = await listen<LibraryScanProgress>("library-scan-progress", (e) => {
      updateProgress(e.payload.completed, e.payload.total, e.payload.current_file);
    });

    try {
      await invoke("set_library_location", { path: selected });
      setLibraryLocation(selected);
      finishProgress("Library scan complete");
      onLibraryChanged();
    } catch (e) {
      failProgress(`Scan failed: ${e}`);
    } finally {
      unlisten();
    }
  }, [startProgress, updateProgress, finishProgress, failProgress, onLibraryChanged]);

  const handleResumeQueue = useCallback((value: boolean) => {
    setResumeQueue(value);
    setSetting("resumeQueueOnLaunch", value);
  }, []);

  const handleRememberTab = useCallback((value: boolean) => {
    setRememberTab(value);
    setSetting("rememberLastTab", value);
  }, []);

  return (
    <>
      <UpdateSection autoCheck={autoCheckUpdate} onAutoCheckStarted={onAutoCheckStarted} />

      <SettingGroup
        title="Library Location"
        description="Your music library folder. Files are organized here as Artist / Album."
      >
        {loading ? (
          <div className="text-xs text-text-tertiary py-4 text-center">Loading...</div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-xl">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="w-4 h-4 text-text-tertiary shrink-0"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.06-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
              />
            </svg>
            <span className="text-xs text-text-secondary truncate flex-1 min-w-0">
              {libraryLocation ?? "Not configured"}
            </span>
            <button
              onClick={handleSetLibraryLocation}
              className="text-[11px] text-accent hover:text-accent-hover transition-colors shrink-0"
            >
              {libraryLocation ? "Change" : "Choose"}
            </button>
          </div>
        )}
      </SettingGroup>

      <SettingGroup title="Startup" description="What Crate does when it launches.">
        <div className="flex flex-col gap-3 px-4 py-3 border border-border rounded-xl">
          <SettingToggle
            label="Resume playback queue"
            hint="Restore the queue and playback position from your last session."
            checked={resumeQueue}
            onChange={handleResumeQueue}
            testId="resume-queue-toggle"
          />
          <SettingToggle
            label="Remember last tab"
            hint="Reopen the tab you were using instead of always starting in Library."
            checked={rememberTab}
            onChange={handleRememberTab}
            testId="remember-tab-toggle"
          />
        </div>
      </SettingGroup>

      <SettingGroup title="Help" description="Get reacquainted with what Crate can do.">
        <div className="flex items-center justify-between px-4 py-3 border border-border rounded-xl">
          <div className="min-w-0">
            <p className="text-xs text-text-secondary">Feature tour</p>
            <p className="text-[11px] text-text-tertiary">Replay the quick walkthrough of Crate's main areas.</p>
          </div>
          <button
            onClick={onReplayTour}
            className="text-[11px] text-accent hover:text-accent-hover transition-colors shrink-0"
            data-testid="replay-tour-button"
          >
            Replay tour
          </button>
        </div>
      </SettingGroup>
    </>
  );
};
