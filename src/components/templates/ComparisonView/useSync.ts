import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { CompareEntry, CopyOp, CopyResult, SyncProgress } from "./types";

export const useSync = (
  sourcePath: string,
  targetPath: string,
  visibleEntries: CompareEntry[],
  selected: Set<string>,
  compare: () => Promise<void>,
  setError: (err: string | null) => void,
) => {
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [result, setResult] = useState<CopyResult | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  useEffect(() => {
    let active = true;
    listen<SyncProgress>("sync-progress", (event) => {
      if (active) setProgress(event.payload);
    }).then((fn) => {
      if (active) unlistenRef.current = fn;
      else fn();
    });
    return () => {
      active = false;
      unlistenRef.current?.();
    };
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setSyncing(true);
    setResult(null);
    setProgress(null);
    try {
      await fn();
      await compare();
    } catch (e) {
      setError(`${e}`);
    } finally {
      setSyncing(false);
      setProgress(null);
    }
  };

  const handleCancel = async () => {
    try {
      await invoke("cancel_sync");
    } catch (_) {
      /* ignore */
    }
  };

  const copyToTarget = () =>
    run(async () => {
      const ops: CopyOp[] = visibleEntries
        .filter((e) => selected.has(e.relative_path) && (e.status === "source_only" || e.status === "modified"))
        .map((e) => ({
          source_path: `${sourcePath}/${e.relative_path}`,
          dest_path: `${targetPath}/${e.relative_path}`,
        }));
      if (ops.length) setResult(await invoke<CopyResult>("copy_files", { operations: ops }));
    });

  const copyToSource = () =>
    run(async () => {
      const ops: CopyOp[] = visibleEntries
        .filter((e) => selected.has(e.relative_path) && (e.status === "target_only" || e.status === "modified"))
        .map((e) => ({
          source_path: `${targetPath}/${e.relative_path}`,
          dest_path: `${sourcePath}/${e.relative_path}`,
        }));
      if (ops.length) setResult(await invoke<CopyResult>("copy_files", { operations: ops }));
    });

  const deleteTarget = () =>
    run(async () => {
      const paths = visibleEntries
        .filter((e) => selected.has(e.relative_path) && e.status === "target_only")
        .map((e) => `${targetPath}/${e.relative_path}`);
      if (paths.length) setResult(await invoke<CopyResult>("delete_files", { paths }));
    });

  const mirrorToTarget = () =>
    run(async () => {
      const toCopy = visibleEntries.filter((e) => e.status === "source_only" || e.status === "modified");
      const toDelete = visibleEntries.filter((e) => e.status === "target_only");
      const total = toCopy.length + toDelete.length;
      if (total === 0) return;

      let succeeded = 0,
        failed = 0,
        cancelled = false;
      const errors: string[] = [];

      if (toCopy.length > 0) {
        const ops: CopyOp[] = toCopy.map((e) => ({
          source_path: `${sourcePath}/${e.relative_path}`,
          dest_path: `${targetPath}/${e.relative_path}`,
        }));
        const r = await invoke<CopyResult>("copy_files", { operations: ops });
        succeeded += r.succeeded;
        failed += r.failed;
        errors.push(...r.errors);
        if (r.cancelled) {
          setResult({ total, succeeded, failed, cancelled: true, errors });
          return;
        }
      }

      if (toDelete.length > 0) {
        const paths = toDelete.map((e) => `${targetPath}/${e.relative_path}`);
        const r = await invoke<CopyResult>("delete_files", { paths });
        succeeded += r.succeeded;
        failed += r.failed;
        errors.push(...r.errors);
        cancelled = r.cancelled;
      }

      setResult({ total, succeeded, failed, cancelled, errors });
    });

  return {
    syncing,
    progress,
    result,
    setResult,
    handleCancel,
    copyToTarget,
    copyToSource,
    deleteTarget,
    mirrorToTarget,
  };
};
