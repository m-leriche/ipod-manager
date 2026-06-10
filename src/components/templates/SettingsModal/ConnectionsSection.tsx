import { StreamingSettings } from "./StreamingSettings";
import { DiscoverSettings } from "./DiscoverSettings";
import { LastfmSettings } from "./LastfmSettings";

export const ConnectionsSection = () => (
  <>
    <StreamingSettings />
    <DiscoverSettings />
    <LastfmSettings />
  </>
);
