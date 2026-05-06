import { Component } from "react";
import type { ErrorBoundaryProps, ErrorBoundaryState } from "./types";

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null, showDetails: false };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name}]`, error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, showDetails: false });
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { name, compact } = this.props;
    const { error, showDetails } = this.state;

    if (compact) {
      return (
        <div className="flex items-center gap-2 px-4 py-2 text-[11px] text-danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3.5 h-3.5 shrink-0">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <span className="truncate">{name} crashed</span>
          <button
            onClick={this.handleReset}
            className="shrink-0 px-2 py-0.5 rounded bg-bg-elevated text-text-secondary hover:text-text-primary transition-colors"
          >
            Retry
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-danger/10">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-6 h-6 text-danger">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-text-primary">{name} crashed</h3>
          <p className="text-xs text-text-tertiary max-w-xs">
            Something went wrong rendering this section. Your other panels are unaffected.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={this.handleReset}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-accent text-white hover:brightness-110 transition-all"
          >
            Try Again
          </button>
          <button
            onClick={this.toggleDetails}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-text-tertiary border border-border hover:text-text-secondary hover:border-border-active transition-all"
          >
            {showDetails ? "Hide Details" : "Details"}
          </button>
        </div>

        {showDetails && error && (
          <pre className="mt-2 p-3 rounded-lg bg-bg-elevated border border-border text-[10px] text-text-tertiary text-left max-w-md max-h-40 overflow-auto whitespace-pre-wrap break-words">
            {error.message}
            {error.stack && `\n\n${error.stack}`}
          </pre>
        )}
      </div>
    );
  }
}
