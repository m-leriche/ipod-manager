export const isValidYouTubeUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("youtube.com") || parsed.hostname === "youtu.be";
  } catch {
    return false;
  }
};

export const cleanYouTubeUrl = (url: string): string => {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtube.com")) {
      const videoId = parsed.searchParams.get("v");
      if (videoId) {
        parsed.search = `?v=${videoId}`;
        return parsed.toString();
      }
      parsed.search = "";
      return parsed.toString();
    }

    if (parsed.hostname === "youtu.be") {
      parsed.search = "";
      return parsed.toString();
    }

    return url;
  } catch {
    return url;
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
