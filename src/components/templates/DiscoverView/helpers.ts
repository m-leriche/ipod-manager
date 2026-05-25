/** Format a listener/playcount number for compact display. */
export const formatListeners = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  if (count > 0) return count.toLocaleString();
  return "";
};
