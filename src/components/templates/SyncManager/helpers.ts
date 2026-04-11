import type { Profile } from "../../../types/profiles";

export const emptyProfile = (name: string): Profile => ({
  name,
  source_path: null,
  target_path: null,
  exclusions: [],
});
