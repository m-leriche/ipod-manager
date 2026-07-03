import { useMemo, useState } from "react";
import { usePlayback } from "../../../contexts/PlaybackContext";
import { useViewLayout } from "../../../contexts/ViewLayoutContext";
import { buildActions, filterActions, groupActions } from "./helpers";
import type { CommandAction, CommandPaletteProps } from "./types";

export const CommandPalette = ({
  onClose,
  onSelectTab,
  onSelectTool,
  onOpenSettings,
  onRescan,
  discoverEnabled,
}: CommandPaletteProps) => {
  const { state, pause, resume, next, previous } = usePlayback();
  const { toggleColumnBrowser, toggleAlbumGrid, toggleArtworkCarousel } = useViewLayout();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const actions = useMemo(
    () =>
      buildActions({
        selectTab: onSelectTab,
        selectTool: onSelectTool,
        openSettings: onOpenSettings,
        rescanLibrary: onRescan,
        toggleColumnBrowser,
        toggleAlbumGrid,
        toggleArtworkCarousel,
        togglePlayPause: () => (state.isPlaying ? pause() : resume()),
        nextTrack: next,
        previousTrack: previous,
        discoverEnabled,
      }),
    [
      onSelectTab,
      onSelectTool,
      onOpenSettings,
      onRescan,
      toggleColumnBrowser,
      toggleAlbumGrid,
      toggleArtworkCarousel,
      state.isPlaying,
      pause,
      resume,
      next,
      previous,
      discoverEnabled,
    ],
  );

  const filtered = useMemo(() => filterActions(actions, query), [actions, query]);
  const groups = useMemo(() => groupActions(filtered), [filtered]);

  const runAction = (action: CommandAction) => {
    onClose();
    action.run();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const action = filtered[selectedIndex];
      if (action) runAction(action);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onKeyDown={handleKeyDown}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="relative bg-bg-secondary border border-border rounded-2xl shadow-xl w-[560px] max-w-[90vw] overflow-hidden flex flex-col"
      >
        <div className="flex items-center gap-2.5 px-4 border-b border-border shrink-0">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="w-4 h-4 text-text-tertiary shrink-0"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Type a command..."
            aria-label="Search commands"
            className="flex-1 bg-transparent py-3.5 text-sm text-text-primary placeholder:text-text-tertiary outline-none"
          />
          <kbd className="inline-flex items-center h-5 px-1.5 bg-bg-card border border-border rounded-md text-[10px] font-medium text-text-tertiary shrink-0">
            Esc
          </kbd>
        </div>
        <div role="listbox" aria-label="Commands" className="max-h-[45vh] overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-xs text-text-tertiary">No matching commands</p>
          )}
          {groups.map((group) => (
            <div key={group.group}>
              <h3 className="px-4 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-text-tertiary">
                {group.group}
              </h3>
              {group.actions.map((action) => {
                const index = filtered.indexOf(action);
                const selected = index === selectedIndex;
                return (
                  <button
                    key={action.id}
                    role="option"
                    aria-selected={selected}
                    ref={(el) => {
                      if (selected) el?.scrollIntoView?.({ block: "nearest" });
                    }}
                    onClick={() => runAction(action)}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`w-full text-left px-4 py-2 text-xs transition-colors ${
                      selected ? "bg-bg-card text-text-primary" : "text-text-secondary"
                    }`}
                  >
                    {action.title}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
