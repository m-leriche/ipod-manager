import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ServerUrl {
  label: string;
  url: string;
}

interface SubsonicStatus {
  enabled: boolean;
  port: number;
  username: string;
  urls: ServerUrl[];
}

export const StreamingSettings = () => {
  const [status, setStatus] = useState<SubsonicStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await invoke<SubsonicStatus>("get_subsonic_status");
      setStatus(s);
      setUsername(s.username);
    } catch {
      // Server may not be ready yet
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleSave = async () => {
    if (!username.trim() || !password.trim()) return;
    try {
      await invoke("set_subsonic_credentials", { username: username.trim(), password: password.trim() });
      setSaved(true);
      setEditing(false);
      setPassword("");
      setTimeout(() => setSaved(false), 2000);
      loadStatus();
    } catch {
      // Save failed
    }
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard not available
    }
  };

  return (
    <div className="mt-6">
      <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-1">
        Streaming Server
      </span>
      <p className="text-[10px] text-text-tertiary mb-3">
        Stream your library to any Subsonic-compatible app (Amperfy, play:Sub, DSub).
      </p>

      {/* Server Status */}
      <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-xl">
        <div className={`w-2 h-2 rounded-full shrink-0 ${status?.enabled ? "bg-green-500" : "bg-red-500"}`} />
        <span className="text-xs text-text-secondary flex-1">
          {status ? `Running on port ${status.port}` : "Loading..."}
        </span>
        {status && <span className="text-[10px] text-text-tertiary">{status.username}</span>}
      </div>

      {/* Connection URLs */}
      {status && status.urls.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest">
            Server URL{status.urls.length > 1 ? "s" : ""}
          </span>
          {status.urls.map((u) => (
            <div key={u.url} className="flex items-center gap-3 px-4 py-2.5 border border-border rounded-xl">
              <span className="text-[10px] text-text-tertiary shrink-0 w-16">{u.label}</span>
              <code className="text-xs text-text-primary font-mono flex-1 truncate">{u.url}</code>
              <button
                onClick={() => handleCopy(u.url)}
                className="text-[11px] text-accent hover:text-accent-hover transition-colors shrink-0"
                data-testid={`copy-${u.label.toLowerCase().replace(/\s/g, "-")}`}
              >
                {copied === u.url ? "Copied" : "Copy"}
              </button>
            </div>
          ))}
        </div>
      )}

      {status && status.urls.length === 0 && (
        <p className="mt-2 text-[10px] text-text-tertiary px-1">
          No network interfaces detected. Check your WiFi connection.
        </p>
      )}

      {/* Credentials */}
      {editing ? (
        <div className="mt-3 flex flex-col gap-2">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="px-4 py-2.5 border border-border rounded-xl bg-bg-primary text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
            data-testid="username-input"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            className="px-4 py-2.5 border border-border rounded-xl bg-bg-primary text-xs text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent"
            data-testid="password-input"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!username.trim() || !password.trim()}
              className="text-[11px] px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              data-testid="save-credentials"
            >
              Save
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setPassword("");
                if (status) setUsername(status.username);
              }}
              className="text-[11px] px-4 py-2 text-text-tertiary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
          </div>
          <p className="text-[10px] text-text-tertiary px-1">Credential changes take effect on next app restart.</p>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] text-accent hover:text-accent-hover transition-colors"
            data-testid="change-credentials"
          >
            Change credentials
          </button>
          {saved && (
            <span className="text-[10px] text-green-500" data-testid="saved-indicator">
              Saved
            </span>
          )}
        </div>
      )}
    </div>
  );
};
