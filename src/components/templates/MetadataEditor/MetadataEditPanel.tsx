import type { EditableFields } from "./types";

interface MetadataEditPanelProps {
  fields: EditableFields;
  mixed: Record<keyof EditableFields, boolean>;
  selectedCount: number;
  dirtyCount: number;
  saving: boolean;
  onFieldChange: (field: keyof EditableFields, value: string) => void;
  onSave: () => void;
  onRevert: () => void;
}

const Field = ({
  label,
  value,
  mixed,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  mixed: boolean;
  onChange: (v: string) => void;
  className?: string;
}) => (
  <div className={className}>
    <label className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-1">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={mixed ? "(mixed)" : ""}
      className="w-full px-3 py-1.5 bg-bg-card border border-border rounded-lg text-xs text-text-primary outline-none focus:border-border-active transition-colors placeholder:text-text-tertiary"
    />
  </div>
);

export const MetadataEditPanel = ({
  fields,
  mixed,
  selectedCount,
  dirtyCount,
  saving,
  onFieldChange,
  onSave,
  onRevert,
}: MetadataEditPanelProps) => (
  <div className="w-80 shrink-0 bg-bg-secondary border border-border rounded-2xl flex flex-col min-h-0">
    {/* Header */}
    <div className="px-4 py-3 border-b border-border shrink-0">
      <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-widest">
        Editing {selectedCount} {selectedCount === 1 ? "track" : "tracks"}
      </span>
    </div>

    {/* Form */}
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      <Field label="Title" value={fields.title} mixed={mixed.title} onChange={(v) => onFieldChange("title", v)} />
      <Field label="Artist" value={fields.artist} mixed={mixed.artist} onChange={(v) => onFieldChange("artist", v)} />
      <Field label="Album" value={fields.album} mixed={mixed.album} onChange={(v) => onFieldChange("album", v)} />
      <Field
        label="Album Artist"
        value={fields.album_artist}
        mixed={mixed.album_artist}
        onChange={(v) => onFieldChange("album_artist", v)}
      />
      <Field
        label="Sort Artist"
        value={fields.sort_artist}
        mixed={mixed.sort_artist}
        onChange={(v) => onFieldChange("sort_artist", v)}
      />
      <Field
        label="Sort Album Artist"
        value={fields.sort_album_artist}
        mixed={mixed.sort_album_artist}
        onChange={(v) => onFieldChange("sort_album_artist", v)}
      />
      <div className="flex gap-2">
        <Field
          label="Track #"
          value={fields.track}
          mixed={mixed.track}
          onChange={(v) => onFieldChange("track", v)}
          className="flex-1"
        />
        <Field
          label="of"
          value={fields.track_total}
          mixed={mixed.track_total}
          onChange={(v) => onFieldChange("track_total", v)}
          className="flex-1"
        />
      </div>
      <Field label="Year" value={fields.year} mixed={mixed.year} onChange={(v) => onFieldChange("year", v)} />
      <Field label="Genre" value={fields.genre} mixed={mixed.genre} onChange={(v) => onFieldChange("genre", v)} />
    </div>

    {/* Actions */}
    <div className="px-4 py-3 border-t border-border shrink-0 flex gap-2">
      <button
        onClick={onSave}
        disabled={dirtyCount === 0 || saving}
        className="flex-1 py-2 bg-text-primary text-bg-primary rounded-xl text-xs font-medium transition-all hover:not-disabled:opacity-90 disabled:opacity-20 disabled:cursor-not-allowed"
      >
        {saving ? "Saving..." : `Save ${dirtyCount} Change${dirtyCount !== 1 ? "s" : ""}`}
      </button>
      <button
        onClick={onRevert}
        className="py-2 px-3 bg-bg-card border border-border text-text-secondary rounded-xl text-xs font-medium hover:bg-bg-hover hover:text-text-primary transition-all"
      >
        Revert
      </button>
    </div>
  </div>
);
