import type { DiskInfo } from "../MountPanel/types";
import type { IpodInfo } from "../../../types/ipod";

export type SummaryStatus = "loading" | "loaded" | "error" | "no_ipod";

export interface IpodSummaryProps {
  diskInfo: DiskInfo | null;
  isMounted: boolean;
  cachedInfo: IpodInfo | null;
  onInfoLoaded: (info: IpodInfo | null) => void;
}
