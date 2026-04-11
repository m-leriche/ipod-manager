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
