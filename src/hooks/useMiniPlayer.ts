import { useState, useRef, useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize, PhysicalSize } from "@tauri-apps/api/dpi";

export const useMiniPlayer = () => {
  const [miniPlayer, setMiniPlayer] = useState(false);
  const savedSizeRef = useRef<{ width: number; height: number } | null>(null);

  const toggleMiniPlayer = useCallback(async () => {
    const win = getCurrentWindow();
    if (!miniPlayer) {
      // Save current size before shrinking
      const size = await win.innerSize();
      savedSizeRef.current = { width: size.width, height: size.height };
      await win.setMinSize(new LogicalSize(300, 380));
      await win.setSize(new LogicalSize(300, 380));
      await win.setAlwaysOnTop(true);
      setMiniPlayer(true);
    } else {
      await win.setAlwaysOnTop(false);
      await win.setMinSize(null);
      const saved = savedSizeRef.current;
      if (saved) {
        // innerSize() returns physical pixels, so restore with PhysicalSize
        await win.setSize(new PhysicalSize(saved.width, saved.height));
      } else {
        await win.setSize(new LogicalSize(1200, 800));
      }
      setMiniPlayer(false);
    }
  }, [miniPlayer]);

  return { miniPlayer, toggleMiniPlayer };
};
