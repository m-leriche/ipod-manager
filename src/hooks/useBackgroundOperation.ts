import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface BackgroundOperationState {
  active: boolean;
  total: number;
  completed: number;
  currentItem: string;
}

interface ProgressPayload {
  total: number;
  completed: number;
  [key: string]: unknown;
}

interface BackgroundOperationConfig<TResult> {
  progressEvent: string;
  progressItemKey: string;
  startCommand: string;
  cancelCommand: string;
  scanningLabel: string;
  onSuccess?: (result: TResult) => void;
  onError: (error: unknown) => TResult;
}

export interface BackgroundOperationActions<TResult> {
  state: BackgroundOperationState;
  result: TResult | null;
  start: () => void;
  cancel: () => void;
  dismissResult: () => void;
}

export const useBackgroundOperation = <TResult>(
  config: BackgroundOperationConfig<TResult>,
): BackgroundOperationActions<TResult> => {
  const [state, setState] = useState<BackgroundOperationState>({
    active: false,
    total: 0,
    completed: 0,
    currentItem: "",
  });
  const [result, setResult] = useState<TResult | null>(null);
  const activeRef = useRef(false);
  const configRef = useRef(config);
  configRef.current = config;

  const start = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    const c = configRef.current;
    setState({ active: true, total: 0, completed: 0, currentItem: c.scanningLabel });

    const unlisten = await listen<ProgressPayload>(c.progressEvent, (e) => {
      setState({
        active: true,
        total: e.payload.total,
        completed: e.payload.completed,
        currentItem: String(e.payload[c.progressItemKey] || ""),
      });
    });

    try {
      const res = await invoke<TResult>(c.startCommand);
      setResult(res);
      configRef.current.onSuccess?.(res);
    } catch (e) {
      setResult(configRef.current.onError(e));
    } finally {
      unlisten();
      activeRef.current = false;
      setState({ active: false, total: 0, completed: 0, currentItem: "" });
    }
  }, []);

  const cancel = useCallback(() => {
    invoke(configRef.current.cancelCommand).catch((e) => console.warn("Cancel command failed:", e));
  }, []);

  const dismissResult = useCallback(() => setResult(null), []);

  return { state, result, start, cancel, dismissResult };
};
