import { useState } from "react";
import { YouTubeDownloader } from "../YouTubeDownloader/YouTubeDownloader";
import { VideoExtractor } from "../VideoExtractor/VideoExtractor";

type Source = "youtube" | "video";

export const AudioExtractor = () => {
  const [source, setSource] = useState<Source>("youtube");

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      {/* Source toggle */}
      <div className="flex justify-center shrink-0">
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setSource("youtube")}
            className={`px-4 py-1.5 text-[11px] font-medium transition-all ${
              source === "youtube" ? "bg-bg-card text-text-primary" : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            YouTube
          </button>
          <button
            onClick={() => setSource("video")}
            className={`px-4 py-1.5 text-[11px] font-medium transition-all ${
              source === "video" ? "bg-bg-card text-text-primary" : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            Local Video
          </button>
        </div>
      </div>

      {/* Content */}
      {source === "youtube" ? <YouTubeDownloader /> : <VideoExtractor />}
    </div>
  );
};
