import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { StorageBar } from "./StorageBar";
import { fmtBytes } from "./helpers";
import type { IpodInfo } from "../../../types/ipod";
import type { SummaryStatus, IpodSummaryProps } from "./types";

export const IpodSummary = ({ diskInfo, isMounted, cachedInfo, onInfoLoaded }: IpodSummaryProps) => {
  const [status, setStatus] = useState<SummaryStatus>(cachedInfo ? "loaded" : "no_ipod");
  const [info, setInfo] = useState<IpodInfo | null>(cachedInfo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isMounted || !diskInfo?.mount_point) {
      setStatus("no_ipod");
      setInfo(null);
      onInfoLoaded(null);
      return;
    }

    // Already have info for this mount point — no re-fetch needed
    if (cachedInfo && cachedInfo.mount_point === diskInfo.mount_point) {
      setInfo(cachedInfo);
      setStatus("loaded");
      return;
    }

    const fetchInfo = async () => {
      setStatus("loading");
      setError(null);
      try {
        const result = await invoke<IpodInfo>("get_ipod_info", {
          mountPoint: diskInfo.mount_point,
          diskInfo,
        });
        setInfo(result);
        onInfoLoaded(result);
        setStatus("loaded");
      } catch (e) {
        setError(`${e}`);
        setStatus("error");
      }
    };

    fetchInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when mount state changes
  }, [isMounted, diskInfo?.mount_point]);

  if (status === "no_ipod") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-text-tertiary/30 mb-4">
            <IpodIcon size={64} />
          </div>
          <p className="text-xs text-text-tertiary">Connect and mount your iPod to see device info</p>
        </div>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-text-tertiary text-xs">
          <Spinner />
          Reading device info...
        </div>
      </div>
    );
  }

  if (status === "error" || !info) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xs text-danger">{error ?? "Failed to read device info"}</p>
        </div>
      </div>
    );
  }

  const displayName = info.volume_name || "iPod";
  const displayModel = info.model_name ?? info.model_number ?? diskInfo?.media_name ?? null;

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-4 min-h-0 overflow-y-auto pr-1">
      {/* Device Header */}
      <div className="bg-bg-secondary border border-border rounded-2xl px-6 py-5 flex items-center gap-5">
        <div className="text-text-tertiary/30 shrink-0">
          <IpodIcon size={80} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary truncate">{displayName}</h2>
          {displayModel && <p className="text-xs text-text-secondary mt-0.5">{displayModel}</p>}
          <p className="text-[11px] text-text-tertiary mt-1">{fmtBytes(info.total_space)}</p>
        </div>
      </div>

      {/* Device Info */}
      <div className="bg-bg-secondary border border-border rounded-2xl px-5 py-3">
        <h3 className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest mb-1">Device Info</h3>
        <div className="bg-bg-card border border-border rounded-xl p-4">
          {displayModel && <Row label="Model" value={displayModel} />}
          {info.serial_number && <Row label="Serial" value={info.serial_number} />}
          {info.firmware_version && <Row label="Firmware" value={info.firmware_version} />}
          <Row label="Format" value={info.format} />
          <Row label="Capacity" value={fmtBytes(info.total_space)} />
          <Row label="Mount" value={info.mount_point} />
        </div>
      </div>

      {/* Rockbox Info */}
      {info.has_rockbox && (
        <div className="bg-bg-secondary border border-border rounded-2xl px-5 py-3">
          <h3 className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest mb-1">Rockbox</h3>
          <div className="bg-bg-card border border-border rounded-xl p-4">
            {info.rockbox_version && <Row label="Version" value={info.rockbox_version} />}
            {info.rockbox_track_count != null && (
              <Row label="Database" value={`${info.rockbox_track_count.toLocaleString()} tracks`} />
            )}
          </div>
        </div>
      )}

      {/* Storage Bar */}
      <div className="bg-bg-secondary border border-border rounded-2xl px-5 py-4">
        <StorageBar
          audioSpace={info.audio_space}
          otherSpace={info.other_space}
          freeSpace={info.free_space}
          totalSpace={info.total_space}
        />
      </div>
    </div>
  );
};

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between items-center py-2 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border-subtle">
    <span className="text-text-tertiary text-[11px]">{label}</span>
    <span className="text-[11px] font-medium text-text-secondary">{value}</span>
  </div>
);

const IpodIcon = ({ size = 48 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 64"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Body */}
    <rect x="4" y="2" width="40" height="60" rx="6" />
    {/* Screen */}
    <rect x="10" y="7" width="28" height="20" rx="2" />
    {/* Click wheel */}
    <circle cx="24" cy="44" r="12" />
    {/* Center button */}
    <circle cx="24" cy="44" r="5" />
  </svg>
);
