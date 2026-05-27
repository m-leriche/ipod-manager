import { useEffect, useRef } from "react";
import { useUpdateChecker } from "../../../hooks/useUpdateChecker";
import { Spinner } from "../../atoms/Spinner/Spinner";
import { getVersion } from "@tauri-apps/api/app";
import { useState } from "react";

interface UpdateSectionProps {
  autoCheck?: boolean;
}

export const UpdateSection = ({ autoCheck }: UpdateSectionProps) => {
  const { state, checkForUpdate, downloadAndInstall } = useUpdateChecker();
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const didAutoCheck = useRef(false);

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (autoCheck && !didAutoCheck.current) {
      didAutoCheck.current = true;
      checkForUpdate();
    }
  }, [autoCheck, checkForUpdate]);

  return (
    <div className="mb-6">
      <span className="text-[10px] font-medium text-text-tertiary uppercase tracking-widest block mb-1">Updates</span>
      <div className="flex items-center gap-3 px-4 py-3 border border-border rounded-xl">
        {appVersion && <span className="text-[10px] text-text-tertiary shrink-0">v{appVersion}</span>}

        {state.available ? (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-[11px] text-accent font-medium">v{state.version} available</span>
            <button
              onClick={downloadAndInstall}
              disabled={state.downloading}
              className="text-[11px] px-3 py-1 bg-accent text-white rounded-md hover:bg-accent-hover transition-colors disabled:opacity-50 ml-auto shrink-0"
            >
              {state.downloading ? "Installing..." : "Update & Restart"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-xs text-text-secondary flex-1">
              {state.checking ? "Checking..." : state.error ? "Check failed" : "You're up to date"}
            </span>
            <button
              onClick={checkForUpdate}
              disabled={state.checking}
              className="text-[11px] text-accent hover:text-accent-hover transition-colors shrink-0 disabled:opacity-50 flex items-center gap-1.5"
            >
              {state.checking && <Spinner />}
              Check for Updates
            </button>
          </div>
        )}
      </div>
      {state.error && <p className="text-[10px] text-text-tertiary mt-1 px-1">{state.error}</p>}
    </div>
  );
};
