export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Label shown in the fallback UI (e.g. "Library", "File Sync") */
  name: string;
  /** Optional compact mode for smaller sections like the now-playing bar */
  compact?: boolean;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
}
