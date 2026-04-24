import type { DiskInfo } from "../MountPanel/types";

export type SummaryStatus = "loading" | "loaded" | "error" | "no_ipod";

export interface IpodSummaryProps {
  diskInfo: DiskInfo | null;
  isMounted: boolean;
}
