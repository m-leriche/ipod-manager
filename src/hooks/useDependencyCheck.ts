import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export const useDependencyCheck = (command: string) => {
  const [ok, setOk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = () => {
    setOk(null);
    setError(null);
    invoke(command)
      .then(() => setOk(true))
      .catch((e) => {
        setOk(false);
        setError(`${e}`);
      });
  };

  useEffect(check, [command]);

  return { ok, error, recheck: check };
};
