import type { EditableChapter } from "./types";

interface ChapterEditorProps {
  chapters: EditableChapter[];
  errors: Map<number, string>;
  onAdd: () => void;
  onRemove: (id: number) => void;
  onChange: (id: number, field: "title" | "timestamp", value: string) => void;
}

export const ChapterEditor = ({ chapters, errors, onAdd, onRemove, onChange }: ChapterEditorProps) => (
  <div className="bg-bg-secondary border border-border rounded-2xl overflow-hidden">
    <div className="px-5 py-2.5 bg-bg-card border-b border-border flex items-center justify-between">
      <span className="text-[11px] font-medium text-text-tertiary uppercase tracking-widest">Chapters</span>
      <button
        onClick={onAdd}
        className="px-3 py-1.5 bg-bg-elevated border border-border text-text-secondary rounded-lg text-[11px] font-medium hover:text-text-primary hover:border-border-active transition-all"
      >
        + Add Chapter
      </button>
    </div>

    {chapters.length === 0 ? (
      <div className="px-5 py-6 text-center text-text-tertiary text-xs">
        No chapters — audio will be extracted as a single file
      </div>
    ) : (
      <div>
        {chapters.map((ch, i) => (
          <div key={ch.id}>
            <div className="flex items-center gap-3 px-5 py-2.5 border-b border-border-subtle">
              <span className="text-text-tertiary text-xs font-medium w-6 shrink-0 text-center">{i + 1}</span>
              <input
                type="text"
                value={ch.title}
                onChange={(e) => onChange(ch.id, "title", e.target.value)}
                placeholder={`Chapter ${i + 1}`}
                className="flex-1 min-w-0 px-3 py-1.5 bg-bg-card border border-border rounded-lg text-xs text-text-primary outline-none focus:border-border-active transition-colors placeholder:text-text-tertiary"
              />
              <input
                type="text"
                value={ch.timestamp}
                onChange={(e) => onChange(ch.id, "timestamp", e.target.value)}
                placeholder="0:00"
                className={`w-24 px-3 py-1.5 bg-bg-card border rounded-lg text-xs text-text-primary outline-none focus:border-border-active transition-colors placeholder:text-text-tertiary text-center tabular-nums ${
                  errors.has(ch.id) ? "border-danger" : "border-border"
                }`}
              />
              <button
                onClick={() => onRemove(ch.id)}
                className="w-6 h-6 bg-bg-card border border-border rounded-lg text-text-tertiary text-xs flex items-center justify-center hover:text-danger hover:border-danger/30 transition-all shrink-0"
              >
                &times;
              </button>
            </div>
            {errors.has(ch.id) && (
              <div className="px-5 py-1.5 text-[11px] text-danger bg-danger/5 border-b border-border-subtle pl-14">
                {errors.get(ch.id)}
              </div>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
);
