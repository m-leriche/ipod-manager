import type { TrackMetadata, MetadataTemplate } from "../../../types/metadata";
import type { EditableFields } from "./types";
import { trackToEditable } from "./helpers";

/** Text fields that find & replace can operate on. */
export const STRING_FIELDS = [
  "title",
  "artist",
  "album",
  "album_artist",
  "sort_artist",
  "sort_album_artist",
  "genre",
] as const;

export type StringField = (typeof STRING_FIELDS)[number];

/** Fields a template can set (per-track fields like title/track are excluded). */
export const TEMPLATE_FIELDS = [
  "artist",
  "album",
  "album_artist",
  "sort_artist",
  "sort_album_artist",
  "genre",
  "year",
] as const;

export type TemplateField = (typeof TEMPLATE_FIELDS)[number];

export interface FindReplaceOptions {
  fields: StringField[];
  find: string;
  replace: string;
  useRegex: boolean;
  caseSensitive: boolean;
}

export interface FieldChange {
  filePath: string;
  fileName: string;
  field: keyof EditableFields;
  before: string;
  after: string;
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Compile the search pattern. Returns null for an invalid regex. */
export const buildMatcher = (options: FindReplaceOptions): RegExp | null => {
  const flags = options.caseSensitive ? "g" : "gi";
  try {
    return new RegExp(options.useRegex ? options.find : escapeRegex(options.find), flags);
  } catch {
    return null;
  }
};

const currentFields = (track: TrackMetadata, editedTracks: Record<string, EditableFields>): EditableFields =>
  editedTracks[track.file_path] ?? trackToEditable(track);

/**
 * Compute the changes a find & replace would make across `tracks`, on top of
 * any already-staged edits. Returns null when the pattern is invalid.
 */
export const previewFindReplace = (
  tracks: TrackMetadata[],
  editedTracks: Record<string, EditableFields>,
  options: FindReplaceOptions,
): FieldChange[] | null => {
  if (options.find === "") return [];
  const matcher = buildMatcher(options);
  if (!matcher) return null;

  const changes: FieldChange[] = [];
  for (const track of tracks) {
    const fields = currentFields(track, editedTracks);
    for (const field of options.fields) {
      const before = fields[field];
      if (before === "") continue;
      // In literal mode the replacement is literal too — a function callback
      // prevents "$&"-style patterns from being interpreted.
      const after = options.useRegex
        ? before.replace(matcher, options.replace)
        : before.replace(matcher, () => options.replace);
      if (after !== before) {
        changes.push({ filePath: track.file_path, fileName: track.file_name, field, before, after });
      }
    }
  }
  return changes;
};

/** Merge a list of field changes into the staged-edits record. */
export const stageChanges = (
  tracks: TrackMetadata[],
  editedTracks: Record<string, EditableFields>,
  changes: FieldChange[],
): Record<string, EditableFields> => {
  const byPath = new Map(tracks.map((t) => [t.file_path, t]));
  const next = { ...editedTracks };
  for (const change of changes) {
    const track = byPath.get(change.filePath);
    if (!track) continue;
    const existing = next[change.filePath] ?? trackToEditable(track);
    next[change.filePath] = { ...existing, [change.field]: change.after };
  }
  return next;
};

/** Compute the changes applying a template to `tracks` would make. */
export const previewTemplate = (
  tracks: TrackMetadata[],
  editedTracks: Record<string, EditableFields>,
  template: MetadataTemplate,
): FieldChange[] => {
  const changes: FieldChange[] = [];
  for (const track of tracks) {
    const fields = currentFields(track, editedTracks);
    for (const [field, value] of Object.entries(template.fields)) {
      if (!(field in fields)) continue;
      const key = field as keyof EditableFields;
      if (fields[key] !== value) {
        changes.push({
          filePath: track.file_path,
          fileName: track.file_name,
          field: key,
          before: fields[key],
          after: value,
        });
      }
    }
  }
  return changes;
};
