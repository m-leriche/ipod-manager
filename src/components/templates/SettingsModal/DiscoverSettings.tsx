import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export const DiscoverSettings = () => {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<boolean>("get_discover_enabled")
      .then((v) => {
        setEnabled(v);
        setLoaded(true);
      })
      .catch((e) => {
        console.warn("Failed to check discover status:", e);
        setLoaded(true);
      });
  }, []);

  const toggle = useCallback(async (value: boolean) => {
    setEnabled(value);
    try {
      await invoke("set_discover_enabled", { enabled: value });
    } catch {
      setEnabled(!value);
    }
  }, []);

  if (!loaded) return null;

  return (
    <div className="mt-6">
      <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-1">Discover</span>
      <p className="text-[10px] text-text-tertiary mb-3">
        Get artist and album recommendations from Last.fm based on your library.
      </p>
      <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-xl">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => toggle(e.target.checked)}
            className="accent-accent w-3.5 h-3.5"
            data-testid="discover-toggle"
          />
          <span className="text-[11px] text-text-primary">Enable Discover tab</span>
        </label>
      </div>
    </div>
  );
};
