import { useLastfm, useLastfmState } from "../../../contexts/LastfmContext";

export const LastfmSettings = () => {
  const state = useLastfmState();
  const { connect, cancelConnect, disconnect, setScrobbleEnabled } = useLastfm();

  return (
    <div className="mt-6">
      <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-1">Last.fm</span>
      <p className="text-[10px] text-text-tertiary mb-3">Scrobble your listening history to Last.fm.</p>

      {state.connecting ? (
        <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-xl">
          <svg className="w-3.5 h-3.5 text-accent animate-spin" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={2} opacity={0.3} />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
          <span className="text-xs text-text-secondary flex-1">Waiting for authorization in your browser...</span>
          <button
            onClick={cancelConnect}
            className="text-[11px] text-text-tertiary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : state.connected ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-xl">
            <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
            <span className="text-xs text-text-secondary flex-1">
              Connected as <span className="text-text-primary font-medium">{state.username}</span>
            </span>
            <button onClick={disconnect} className="text-[11px] text-red-400 hover:text-red-300 transition-colors">
              Disconnect
            </button>
          </div>

          <label className="flex items-center gap-3 px-4 py-3 border border-border rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={state.scrobbleEnabled}
              onChange={(e) => setScrobbleEnabled(e.target.checked)}
              className="accent-accent w-3.5 h-3.5"
            />
            <span className="text-xs text-text-secondary flex-1">Enable scrobbling</span>
          </label>

          {state.queueCount > 0 && (
            <p className="text-[10px] text-text-tertiary px-1">
              {state.queueCount} scrobble{state.queueCount !== 1 ? "s" : ""} queued for submission
            </p>
          )}
        </div>
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
              d="m9 9 10.5-3m0 6.553v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66a2.25 2.25 0 0 0 1.632-2.163Zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 0 1-1.632 2.163l-1.32.377a1.803 1.803 0 0 1-.99-3.467l2.31-.66A2.25 2.25 0 0 0 9 15.553Z"
            />
          </svg>
          <span className="text-xs text-text-secondary flex-1">Not connected</span>
          <button onClick={connect} className="text-[11px] text-accent hover:text-accent-hover transition-colors">
            Connect
          </button>
        </div>
      )}
    </div>
  );
};
