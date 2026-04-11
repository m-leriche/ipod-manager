export const isValidYouTubeUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname.includes("youtube.com") ||
      parsed.hostname === "youtu.be" ||
      parsed.hostname === "music.youtube.com"
    );
  } catch {
    return false;
  }
};

export const formatSeconds = (secs: number): string => {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const fileNameFromPath = (path: string): string => {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
};
