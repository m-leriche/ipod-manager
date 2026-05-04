interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

/** Shimmer placeholder for loading states. Uses the `.skeleton` class from App.css. */
export const Skeleton = ({ className = "", style }: SkeletonProps) => (
  <div className={`skeleton ${className}`} style={style} />
);

/** A skeleton resembling a track table row. */
export const TrackRowSkeleton = ({ index }: { index: number }) => (
  <div className="flex items-center gap-3 px-3 h-8" style={{ animationDelay: `${index * 40}ms` }}>
    <Skeleton className="w-5 h-3" />
    <Skeleton className="flex-[3] h-3" />
    <Skeleton className="flex-[2] h-3" />
    <Skeleton className="flex-[2] h-3" />
    <Skeleton className="w-10 h-3" />
  </div>
);

/** A skeleton resembling an album grid card. */
export const AlbumCardSkeleton = () => (
  <div className="flex flex-col items-center p-2">
    <Skeleton className="w-full aspect-square rounded-lg" />
    <Skeleton className="w-3/4 h-3 mt-2" />
    <Skeleton className="w-1/2 h-2.5 mt-1" />
  </div>
);

/** Full library loading skeleton with browser + tracks. */
export const LibraryLoadingSkeleton = () => (
  <div className="flex flex-col h-full view-enter">
    {/* Search bar skeleton */}
    <div className="flex items-center gap-3 px-3 py-2 border-b border-border shrink-0">
      <Skeleton className="w-48 h-6" />
      <Skeleton className="w-16 h-6" />
      <div className="flex-1" />
      <Skeleton className="w-16 h-3" />
    </div>
    {/* Column browser skeleton */}
    <div className="flex gap-0 border-b border-border" style={{ height: "35%" }}>
      {[0, 1, 2].map((col) => (
        <div key={col} className="flex-1 border-r border-border last:border-r-0 p-2 space-y-2">
          <Skeleton className="w-16 h-2.5" />
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-3" style={{ width: `${55 + Math.sin(i + col) * 25}%` }} />
          ))}
        </div>
      ))}
    </div>
    {/* Track rows skeleton */}
    <div className="flex-1 py-1 space-y-1">
      {Array.from({ length: 12 }).map((_, i) => (
        <TrackRowSkeleton key={i} index={i} />
      ))}
    </div>
  </div>
);
