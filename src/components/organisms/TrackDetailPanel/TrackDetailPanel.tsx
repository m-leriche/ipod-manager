import { memo, useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { AlbumArtwork } from "../../atoms/AlbumArtwork/AlbumArtwork";
import type { LibraryTrack } from "../../../types/library";
import type { MetadataSaveResult } from "../../../types/metadata";
import type { EditableTrackFields, EditableFieldKey } from "./types";
import { formatDuration, formatSize, computeBatchFields, buildMetadataUpdates } from "./helpers";

interface TrackDetailPanelProps {
  tracks: LibraryTrack[];
  onSave?: () => void;
}

export const TrackDetailPanel = memo(function TrackDetailPanel({ tracks, onSave }: TrackDetailPanelProps) {
  const isSingle = tracks.length === 1;
  const track = tracks[0];

  const { fields: originalFields, mixed: originalMixed } = useMemo(() => computeBatchFields(tracks), [tracks]);

  const [editedFields, setEditedFields] = useState<EditableTrackFields>(originalFields);
  const [mixed, setMixed] = useState(originalMixed);
  const [saving, setSaving] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [artCacheBust, setArtCacheBust] = useState(0);

  // Reset edited fields when selection changes
  useEffect(() => {
    setEditedFields(originalFields);
    setMixed(originalMixed);
  }, [originalFields, originalMixed]);

  const isDirty = useMemo(() => {
    for (const key of Object.keys(editedFields) as EditableFieldKey[]) {
      if (editedFields[key] !== originalFields[key]) return true;
      if (originalMixed[key] && editedFields[key] !== "") return true;
    }
    return false;
  }, [editedFields, originalFields, originalMixed]);

  const handleFieldChange = useCallback(
    (field: EditableFieldKey, value: string) => {
      setEditedFields((prev) => ({ ...prev, [field]: value }));
      // Clear mixed flag once user types in a mixed field
      if (mixed[field]) {
        setMixed((prev) => ({ ...prev, [field]: false }));
      }
    },
    [mixed],
  );

  const handleRevert = useCallback(() => {
    setEditedFields(originalFields);
    setMixed(originalMixed);
  }, [originalFields, originalMixed]);

  const handleSave = useCallback(async () => {
    const updates = buildMetadataUpdates(tracks, editedFields, originalFields, originalMixed);
    if (updates.length === 0) return;

    setSaving(true);
    try {
      await invoke<MetadataSaveResult>("save_metadata", { updates });
      onSave?.();
    } catch (e) {
      console.error("Failed to save metadata:", e);
    } finally {
      setSaving(false);
    }
  }, [tracks, editedFields, originalFields, originalMixed, onSave]);

  const handleRepairArt = useCallback(async () => {
    const folders = [...new Set(tracks.map((t) => t.folder_path))];
    setRepairing(true);

    const unlisten = await listen("albumart-progress", () => {});

    try {
      await invoke("fix_album_art", { folders });
      setArtCacheBust((n) => n + 1);
      onSave?.();
    } catch (e) {
      console.error("Failed to repair album art:", e);
    } finally {
      setRepairing(false);
      unlisten();
    }
  }, [tracks, onSave]);

  return (
    <div className="w-[220px] shrink-0 border-l border-border bg-bg-secondary flex flex-col overflow-y-auto">
      {/* Album artwork */}
      <div className="p-4 flex justify-center">
        <AlbumArtwork
          folderPath={track.folder_path}
          size="lg"
          showMissingLabel
          onRepair={repairing ? undefined : handleRepairArt}
          cacheBust={artCacheBust}
        />
      </div>

      {/* Header */}
      <div className="px-4 pb-3">
        {isSingle ? (
          <div>
            <div className="text-xs font-medium text-text-primary truncate">{track.title || track.file_name}</div>
            <div className="text-[11px] text-text-secondary truncate">{track.artist || "Unknown Artist"}</div>
            <div className="text-[11px] text-text-tertiary truncate">{track.album || "Unknown Album"}</div>
          </div>
        ) : (
          <div className="text-[11px] font-medium text-text-tertiary uppercase tracking-widest">
            Editing {tracks.length} tracks
          </div>
        )}
      </div>

      {/* Editable fields */}
      <div className="px-4 pb-3 space-y-1.5">
        {isSingle && (
          <EditableField
            label="Title"
            value={editedFields.title}
            mixed={mixed.title}
            onChange={(v) => handleFieldChange("title", v)}
          />
        )}
        <EditableField
          label="Artist"
          value={editedFields.artist}
          mixed={mixed.artist}
          onChange={(v) => handleFieldChange("artist", v)}
        />
        <EditableField
          label="Album"
          value={editedFields.album}
          mixed={mixed.album}
          onChange={(v) => handleFieldChange("album", v)}
        />
        <EditableField
          label="Album Artist"
          value={editedFields.album_artist}
          mixed={mixed.album_artist}
          onChange={(v) => handleFieldChange("album_artist", v)}
        />
        <EditableField
          label="Genre"
          value={editedFields.genre}
          mixed={mixed.genre}
          onChange={(v) => handleFieldChange("genre", v)}
        />
        <EditableField
          label="Year"
          value={editedFields.year}
          mixed={mixed.year}
          onChange={(v) => handleFieldChange("year", v)}
          inputType="number"
        />

        {/* Track # of Total */}
        <div className="flex gap-1.5 items-end">
          <EditableField
            label="Track"
            value={editedFields.track_number}
            mixed={mixed.track_number}
            onChange={(v) => handleFieldChange("track_number", v)}
            inputType="number"
            compact
          />
          <span className="text-[9px] text-text-tertiary pb-[3px]">of</span>
          <EditableField
            label=""
            value={editedFields.track_total}
            mixed={mixed.track_total}
            onChange={(v) => handleFieldChange("track_total", v)}
            inputType="number"
            compact
          />
        </div>

        {/* Disc # of Total */}
        <div className="flex gap-1.5 items-end">
          <EditableField
            label="Disc"
            value={editedFields.disc_number}
            mixed={mixed.disc_number}
            onChange={(v) => handleFieldChange("disc_number", v)}
            inputType="number"
            compact
          />
          <span className="text-[9px] text-text-tertiary pb-[3px]">of</span>
          <EditableField
            label=""
            value={editedFields.disc_total}
            mixed={mixed.disc_total}
            onChange={(v) => handleFieldChange("disc_total", v)}
            inputType="number"
            compact
          />
        </div>
      </div>

      {/* Audio info (single track only) */}
      {isSingle && (
        <div className="px-4 pb-3 space-y-1.5 border-t border-border pt-3">
          <DetailRow label="Length" value={formatDuration(track.duration_secs)} />
          <DetailRow label="Size" value={formatSize(track.file_size)} />
          <DetailRow label="Format" value={track.format} />
          {track.bitrate_kbps && <DetailRow label="Bitrate" value={`${track.bitrate_kbps} kbps`} />}
          {track.sample_rate && (
            <DetailRow label="Sample Rate" value={`${(track.sample_rate / 1000).toFixed(1)} kHz`} />
          )}
        </div>
      )}

      {/* Save / Revert footer */}
      {isDirty && (
        <div className="px-4 py-3 border-t border-border mt-auto shrink-0 flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-1.5 bg-text-primary text-bg-primary rounded-lg text-[10px] font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={handleRevert}
            disabled={saving}
            className="py-1.5 px-2.5 bg-bg-card border border-border text-text-secondary rounded-lg text-[10px] font-medium hover:bg-bg-hover hover:text-text-primary transition-all disabled:opacity-40"
          >
            Revert
          </button>
        </div>
      )}
    </div>
  );
});

// ── Inline editable field ──────────────────────────────────────

const EditableField = ({
  label,
  value,
  mixed,
  onChange,
  inputType = "text",
  compact = false,
}: {
  label: string;
  value: string;
  mixed: boolean;
  onChange: (v: string) => void;
  inputType?: "text" | "number";
  compact?: boolean;
}) => {
  const [editing, setEditing] = useState(false);

  return (
    <div className={compact ? "flex-1 min-w-0" : ""}>
      {label && (
        <label className="text-[9px] font-medium text-text-tertiary uppercase tracking-widest block mb-0.5">
          {label}
        </label>
      )}
      {editing ? (
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") setEditing(false);
          }}
          autoFocus
          placeholder={mixed ? "(mixed)" : ""}
          className="w-full px-1.5 py-0.5 bg-bg-card border border-border-active rounded text-[10px] text-text-primary outline-none placeholder:text-text-tertiary/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          className="px-1.5 py-0.5 rounded cursor-text text-[10px] truncate hover:bg-bg-hover/60 transition-colors min-h-[20px] border border-transparent hover:border-border"
        >
          {mixed && !value ? (
            <span className="text-text-tertiary/60 italic">(mixed)</span>
          ) : value ? (
            <span className="text-text-secondary">{value}</span>
          ) : (
            <span className="text-text-tertiary/40">—</span>
          )}
        </div>
      )}
    </div>
  );
};

// ── Read-only detail row ───────────────────────────────────────

const DetailRow = ({ label, value }: { label: string; value: string | null | undefined }) => {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[10px] text-text-tertiary shrink-0">{label}</span>
      <span className="text-[10px] text-text-secondary text-right truncate">{value}</span>
    </div>
  );
};
