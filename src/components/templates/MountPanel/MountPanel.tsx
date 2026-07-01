import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { RetroWindowDots } from "../../atoms/RetroWindowDots/RetroWindowDots";
import { StatusDot } from "./StatusDot";
import type { DiskInfo, Status, Message, MountPanelProps } from "./types";
import { fmtBytes } from "./helpers";

export const MountPanel = ({ onMountChange, onDiskInfoChange, compact = false }: MountPanelProps) => {
  const [status, setStatus] = useState<Status>("detecting");
  const [diskInfo, setDiskInfo] = useState<DiskInfo | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [password, setPassword] = useState("");

  const detectIPod = useCallback(async () => {
    setStatus("detecting");
    setMessage(null);
    try {
      const info = await invoke<DiskInfo | null>("detect_ipod");
      if (info) {
        setDiskInfo(info);
        setStatus(info.mounted ? "mounted" : "found");
      } else {
        setDiskInfo(null);
        setStatus("not_found");
      }
    } catch (err) {
      setDiskInfo(null);
      setStatus("not_found");
      setMessage({ text: `Detection failed: ${err}`, type: "error" });
    }
  }, []);

  useEffect(() => {
    const BASE_MS = 10_000;
    const MAX_MS = 60_000;
    let delay = BASE_MS;
    let timeoutId: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const schedulePoll = async () => {
      try {
        const info = await invoke<DiskInfo | null>("detect_ipod");
        if (info) {
          setDiskInfo(info);
          setStatus(info.mounted ? "mounted" : "found");
          delay = BASE_MS;
        } else {
          setDiskInfo(null);
          setStatus("not_found");
          delay = Math.min(delay * 2, MAX_MS);
        }
      } catch (err) {
        setDiskInfo(null);
        setStatus("not_found");
        // Show the first poll error without spamming on repeated failures
        setMessage((prev) => prev ?? { text: `Detection failed: ${err}`, type: "error" });
        delay = Math.min(delay * 2, MAX_MS);
      }
      if (!cancelled) timeoutId = setTimeout(schedulePoll, delay);
    };

    detectIPod()
      .catch(() => {})
      .then(() => {
        if (!cancelled) timeoutId = setTimeout(schedulePoll, BASE_MS);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [detectIPod]);

  useEffect(() => {
    onMountChange?.(status === "mounted");
  }, [status, onMountChange]);

  useEffect(() => {
    onDiskInfoChange?.(diskInfo);
  }, [diskInfo, onDiskInfoChange]);

  const handleMount = async () => {
    if (!diskInfo) return;
    if (!password) {
      setMessage({ text: "Enter your macOS password to mount", type: "info" });
      return;
    }
    setStatus("mounting");
    setMessage({ text: "Mounting iPod...", type: "info" });
    try {
      const mountedAt = await invoke<string>("mount_ipod", { identifier: diskInfo.identifier, password });
      setPassword("");
      setMessage({ text: `Mounted at ${mountedAt}`, type: "success" });
      await detectIPod();
    } catch (err) {
      setMessage({ text: `${err}`, type: "error" });
      setStatus("found");
    }
  };

  const handleUnmount = async () => {
    setStatus("unmounting");
    setMessage({ text: "Ejecting iPod safely...", type: "info" });
    try {
      await invoke("unmount_ipod");
      setMessage({ text: "iPod ejected safely", type: "success" });
      await detectIPod();
    } catch (err) {
      setMessage({ text: `Unmount failed: ${err}`, type: "error" });
      setStatus("mounted");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && status === "found" && password) {
      e.preventDefault();
      e.stopPropagation();
      handleMount();
    }
  };

  const statusLabel = () => {
    switch (status) {
      case "detecting":
        return (
          <span className="flex items-center gap-1.5">
            <Spinner />
            Scanning
          </span>
        );
      case "not_found":
        return (
          <span className="flex items-center gap-1.5">
            <StatusDot active={false} />
            Disconnected
          </span>
        );
      case "found":
        return (
          <span className="flex items-center gap-1.5">
            <StatusDot active={true} />
            Connected
          </span>
        );
      case "mounted":
        return (
          <span className="flex items-center gap-1.5">
            <StatusDot active={true} />
            Mounted
          </span>
        );
      case "mounting":
        return (
          <span className="flex items-center gap-1.5">
            <Spinner />
            Mounting
          </span>
        );
      case "unmounting":
        return (
          <span className="flex items-center gap-1.5">
            <Spinner />
            Ejecting
          </span>
        );
    }
  };

  const msgClass =
    message?.type === "error"
      ? "bg-danger/10 text-danger"
      : message?.type === "success"
        ? "bg-success/10 text-success"
        : "bg-bg-elevated text-text-secondary";

  // Centered "connect your iPod" hero — used when no iPod is mounted yet.
  if (!compact) {
    const busy = status === "detecting" || status === "mounting" || status === "unmounting";
    const hero = HERO_COPY[status];
    return (
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-bg-secondary border border-border flex items-center justify-center text-text-tertiary mb-5">
          {busy ? <Spinner /> : <IpodGlyph />}
        </div>
        <h2 className="text-base font-semibold text-text-primary mb-1.5">{hero.title}</h2>
        <p className="text-xs text-text-tertiary leading-relaxed mb-5 max-w-[17rem]">
          {status === "found" ? `Enter your macOS password to mount ${diskInfo?.name || "your iPod"}.` : hero.subtitle}
        </p>

        {status === "found" && (
          <input
            type="password"
            placeholder="macOS password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            className="w-full mb-3 px-3.5 py-2.5 bg-bg-card border border-border rounded-xl text-text-primary text-xs outline-none focus:border-border-active transition-colors placeholder:text-text-tertiary"
          />
        )}

        {status === "found" ? (
          <button
            disabled={!password}
            onClick={handleMount}
            className="w-full py-2.5 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            Mount iPod
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={detectIPod}
            className="px-6 py-2.5 bg-bg-card border border-border text-text-secondary rounded-xl text-xs font-medium transition-all hover:not-disabled:bg-bg-hover hover:not-disabled:text-text-primary disabled:opacity-30"
          >
            {busy ? "Scanning…" : "Scan Again"}
          </button>
        )}

        {message && (
          <div className={`mt-4 w-full px-3 py-2 rounded-xl text-[11px] leading-relaxed ${msgClass}`}>
            {message.text}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`bg-bg-secondary border border-border rounded-2xl ${compact ? "p-5 w-[260px] shrink-0 self-start" : "p-6 w-full max-w-md"}`}
    >
      <div className="retro-titlebar flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <RetroWindowDots />
          <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-widest">Connection</span>
        </div>
        <button
          disabled={status === "mounting" || status === "unmounting"}
          onClick={detectIPod}
          className="text-text-tertiary hover:text-text-secondary text-xs transition-colors disabled:opacity-30"
        >
          ↻
        </button>
      </div>

      <div className="bg-bg-card border border-border rounded-xl p-4 mb-4">
        <Row label="Status" value={statusLabel()} />
        {diskInfo && (
          <>
            <Row label="Device" value={`/dev/${diskInfo.identifier}`} />
            {diskInfo.media_name && <Row label="Type" value={diskInfo.media_name} />}
            <Row label="Size" value={diskInfo.size} />
            {diskInfo.name && <Row label="Name" value={diskInfo.name} />}
            {diskInfo.mount_point && <Row label="Mount" value={diskInfo.mount_point} />}
          </>
        )}
        {diskInfo && diskInfo.free_space != null && diskInfo.total_space != null && (
          <StorageBar free={diskInfo.free_space} total={diskInfo.total_space} />
        )}
      </div>

      {status === "found" && (
        <input
          type="password"
          placeholder="macOS password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          className="w-full mb-3.5 px-3.5 py-2.5 bg-bg-card border border-border rounded-xl text-text-primary text-xs outline-none focus:border-border-active transition-colors placeholder:text-text-tertiary"
        />
      )}

      <div className="flex gap-2.5">
        <button
          disabled={status !== "found" || !password}
          onClick={handleMount}
          className="flex-1 py-2.5 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
        >
          Mount
        </button>
        <button
          disabled={status !== "mounted"}
          onClick={handleUnmount}
          className="flex-1 py-2.5 bg-bg-card border border-border text-text-secondary rounded-xl text-xs font-medium transition-all hover:not-disabled:bg-bg-hover hover:not-disabled:text-text-primary disabled:opacity-20 disabled:cursor-not-allowed"
        >
          Eject
        </button>
      </div>

      {message && (
        <div className={`mt-3 px-3 py-2 rounded-xl text-[11px] leading-relaxed ${msgClass}`}>{message.text}</div>
      )}
    </div>
  );
};

const HERO_COPY: Record<Status, { title: string; subtitle: string }> = {
  detecting: { title: "Scanning for iPod…", subtitle: "Looking for a connected device." },
  not_found: {
    title: "No iPod connected",
    subtitle: "Connect your iPod with a USB cable and it'll show up here, ready to mount.",
  },
  found: { title: "iPod found", subtitle: "Enter your macOS password to mount it." },
  mounted: { title: "iPod mounted", subtitle: "Your iPod is ready." },
  mounting: { title: "Mounting iPod…", subtitle: "Unlocking and mounting the device." },
  unmounting: { title: "Ejecting iPod…", subtitle: "Safely unmounting the device." },
};

const IpodGlyph = () => (
  <svg
    width={44}
    height={44}
    viewBox="0 0 48 64"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="4" y="2" width="40" height="60" rx="6" />
    <rect x="10" y="7" width="28" height="20" rx="2" />
    <circle cx="24" cy="44" r="12" />
    <circle cx="24" cy="44" r="5" />
  </svg>
);

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex justify-between items-center py-2 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border-subtle">
    <span className="text-text-tertiary text-[11px]">{label}</span>
    <span className="text-[11px] font-medium text-text-secondary">{value}</span>
  </div>
);

const StorageBar = ({ free, total }: { free: number; total: number }) => {
  const used = total - free;
  const pct = total > 0 ? (used / total) * 100 : 0;
  const color = pct > 90 ? "bg-danger" : pct > 75 ? "bg-warning" : "bg-accent";

  return (
    <div className="pt-2.5 mt-1 border-t border-border-subtle">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-text-tertiary text-[10px] uppercase tracking-widest font-medium">Storage</span>
        <span className="text-[10px] text-text-tertiary">{fmtBytes(free)} free</span>
      </div>
      <div className="w-full h-1.5 bg-bg-primary rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-text-tertiary">{fmtBytes(used)} used</span>
        <span className="text-[10px] text-text-tertiary">{fmtBytes(total)} total</span>
      </div>
    </div>
  );
};
