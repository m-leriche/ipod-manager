import { useState, useCallback } from "react";
import type { ClipboardState } from "./types";

export const useClipboard = () => {
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);

  const copy = useCallback((paths: string[], sourceDir: string) => {
    setClipboard({ paths, operation: "copy", sourceDir });
  }, []);

  const cut = useCallback((paths: string[], sourceDir: string) => {
    setClipboard({ paths, operation: "cut", sourceDir });
  }, []);

  const clear = useCallback(() => setClipboard(null), []);

  const isCut = useCallback(
    (fullPath: string) => clipboard?.operation === "cut" && clipboard.paths.includes(fullPath),
    [clipboard],
  );

  return { clipboard, copy, cut, clear, isCut };
};
