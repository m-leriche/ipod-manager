export interface HealthIssue {
  id: string;
  label: string;
  count: number;
}

export interface HealthReport {
  total_tracks: number;
  issues: HealthIssue[];
}

export type Phase = "idle" | "loading" | "loaded";
