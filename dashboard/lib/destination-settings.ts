import { PLATFORMS } from "./domain";
import { parseDestination } from "./destinations";
import { runtime } from "./security";

export function configuredDestinations() {
  return PLATFORMS.flatMap(platform => {
    const url = runtime(`DESTINATION_${platform.toUpperCase()}_URL`).trim();
    return url ? [parseDestination(platform, url)] : [];
  });
}
