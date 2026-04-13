import type { LibraryStats } from "../../../types/libstats";
import { formatBytes, formatDuration, formatBitrate, formatPercentage, formatNumber } from "./helpers";

const FORMAT_COLORS: Record<string, string> = {
  FLAC: "bg-success",
  MP3: "bg-accent",
  M4A: "bg-warning",
  OGG: "bg-purple-500",
  OPUS: "bg-pink-500",
  WAV: "bg-sky-500",
  AIFF: "bg-teal-500",
  WMA: "bg-orange-400",
  AAC: "bg-yellow-500",
};

const StatCard = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-bg-secondary border border-border rounded-2xl px-4 py-3">
    <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">{label}</p>
    <p className="text-lg font-bold text-text-primary">{value}</p>
  </div>
);

export const StatsOverview = ({ stats }: { stats: LibraryStats }) => {
  const maxFormatCount = Math.max(...stats.format_breakdown.map((f) => f.count), 1);

  return (
    <div className="flex-1 overflow-y-auto space-y-4 pr-1">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Tracks" value={formatNumber(stats.total_tracks)} />
        <StatCard label="Total Size" value={formatBytes(stats.total_size)} />
        <StatCard label="Total Duration" value={formatDuration(stats.total_duration_secs)} />
        <StatCard label="Avg Bitrate" value={formatBitrate(stats.average_bitrate_kbps)} />
        <StatCard label="Artists" value={formatNumber(stats.artist_count)} />
        <StatCard label="Albums" value={formatNumber(stats.album_count)} />
      </div>

      {/* Format breakdown */}
      {stats.format_breakdown.length > 0 && (
        <Section title="Format Breakdown">
          <div className="space-y-2">
            {stats.format_breakdown.map((f) => (
              <div key={f.format} className="flex items-center gap-3 text-xs">
                <span className="w-12 text-text-secondary font-medium shrink-0">{f.format}</span>
                <div className="flex-1 h-2 bg-bg-card rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${FORMAT_COLORS[f.format] ?? "bg-text-tertiary"}`}
                    style={{ width: `${(f.count / maxFormatCount) * 100}%` }}
                  />
                </div>
                <span className="w-14 text-right text-text-tertiary shrink-0">{formatNumber(f.count)}</span>
                <span className="w-14 text-right text-text-tertiary shrink-0">{formatPercentage(f.percentage)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Genre distribution */}
      {stats.genre_distribution.length > 0 && (
        <Section title="Top Genres">
          <div className="flex flex-wrap gap-2">
            {stats.genre_distribution.slice(0, 20).map((g) => (
              <span
                key={g.label}
                className="px-2.5 py-1 bg-bg-card border border-border rounded-lg text-[11px] text-text-secondary"
              >
                {g.label} <span className="text-text-tertiary">{formatNumber(g.count)}</span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Sample rate distribution */}
      {stats.sample_rate_distribution.length > 0 && (
        <Section title="Sample Rates">
          <div className="flex flex-wrap gap-2">
            {stats.sample_rate_distribution.map((s) => (
              <span
                key={s.label}
                className="px-2.5 py-1 bg-bg-card border border-border rounded-lg text-[11px] text-text-secondary"
              >
                {s.label} <span className="text-text-tertiary">{formatNumber(s.count)}</span>
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Year distribution */}
      {stats.year_distribution.length > 0 && (
        <Section title={yearTitle(stats)}>
          <div className="flex flex-wrap gap-2">
            {stats.year_distribution.map((y) => (
              <span
                key={y.year}
                className="px-2.5 py-1 bg-bg-card border border-border rounded-lg text-[11px] text-text-secondary"
              >
                {y.year} <span className="text-text-tertiary">{formatNumber(y.count)}</span>
              </span>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-bg-secondary border border-border rounded-2xl px-5 py-4">
    <h3 className="text-[11px] font-medium text-text-tertiary uppercase tracking-wider mb-3">{title}</h3>
    {children}
  </div>
);

const yearTitle = (stats: LibraryStats): string => {
  if (stats.oldest_year && stats.newest_year && stats.oldest_year !== stats.newest_year) {
    return `Years (${stats.oldest_year}–${stats.newest_year})`;
  }
  return "Years";
};
