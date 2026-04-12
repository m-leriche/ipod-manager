import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { StatusDot } from "./StatusDot";
import type { DiskInfo, Status, Message, MountPanelProps } from "./types";
import { fmtBytes } from "./helpers";

export const MountPanel = ({ onMountChange, compact = false }: MountPanelProps) => {
  const [status, setStatus] = useState<Status>("detecting");
  const [diskInfo, setDiskInfo] = useState<DiskInfo | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [password, setPassword] = useState("");

  const pollIPod = useCallback(async () => {
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
      setMessage((prev) => prev ?? { text: `Detection failed: ${err}`, type: "error" });
    }
  }, []);

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
    detectIPod();
    const POLL_INTERVAL_MS = 10_000;
    const interval = setInterval(pollIPod, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [detectIPod, pollIPod]);

  useEffect(() => {
    onMountChange?.(status === "mounted");
  }, [status, onMountChange]);

  const handleMount = async () => {
    if (!diskInfo) return;
    if (!password) {
      setMessage({ text: "Enter your macOS password to mount", type: "info" });
      return;
    }
    setStatus("mounting");
    setMessage({ text: "Mounting iPod...", type: "info" });
    try {
      await invoke("mount_ipod", { identifier: diskInfo.identifier, password });
      setPassword("");
      setMessage({ text: "Mounted at /Volumes/IPOD", type: "success" });
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
    if (e.key === "Enter" && status === "found" && password) handleMount();
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

  return (
    <div
      className={`bg-bg-secondary border border-border rounded-2xl ${compact ? "p-5 w-[260px] shrink-0" : "p-6 w-full max-w-md"}`}
    >
      <div className="flex items-center justify-between mb-5">
        <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-widest">Connection</span>
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
