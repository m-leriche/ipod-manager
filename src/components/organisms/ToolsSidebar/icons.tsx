import type { ToolTab } from "./types";

const svg = (children: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-full h-full">
    {children}
  </svg>
);

export const TOOL_ICONS: Record<ToolTab, React.ReactNode> = {
  ipod: svg(
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" strokeLinejoin="round" />
      <circle cx="12" cy="15" r="3.25" />
      <line x1="9" y1="6" x2="15" y2="6" strokeLinecap="round" />
    </>,
  ),
  files: svg(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"
    />,
  ),
  export: svg(
    <>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v3H4z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 11h4" />
    </>,
  ),
  health: svg(<path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2.5 6 4-13 2.5 7H21" />),
  duplicates: svg(
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" strokeLinejoin="round" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16V6a2 2 0 0 1 2-2h10" />
    </>,
  ),
  metadata: svg(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6l6 6v10a2 2 0 0 1-2 2z"
    />,
  ),
  audio: svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="1.5" strokeLinejoin="round" />
      <path strokeLinecap="round" d="M7 4v16M17 4v16M3 9h4m10 0h4M3 15h4m10 0h4" />
    </>,
  ),
  convert: svg(
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M4 9a8 8 0 0 1 14-3m2-2v4h-4M20 15a8 8 0 0 1-14 3m-2 2v-4h4"
    />,
  ),
};
