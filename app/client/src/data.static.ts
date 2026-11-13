// Client data seam — the STATIC implementation.
//
// This file ships alongside the fullstack seam (./data.ts) and replaces
// it for the static build (kit, Part F step 8): copy it over data.ts,
// set APP_BUILD_MODE to "static" in ./buildMode.ts, and regenerate
// ./generated/snapshot.ts from the current publish payload. It returns
// the same three shapes as the server-backed seam —
// { events, favorite_ids, last_synced_at }, { locations }, { sources } —
// from the baked snapshot instead of the RPC proxy, and it imports no
// server machinery, so the static bundle is self-contained.
//
// The seam is reads only: no arguments, no filtering, no writes.
// Filtering runs client-side over the full lists, exactly as in the
// fullstack build, and favorites/hides stay local-only.

import {
  eventsData,
  igSourcesData,
  locationsData,
  type EventsData,
  type IgSourcesData,
  type LocationsData,
} from "./generated/snapshot";

export type { EventsData, IgSourcesData, LocationsData };

export async function listEvents(): Promise<EventsData> {
  return eventsData;
}

export async function listLocations(): Promise<LocationsData> {
  return locationsData;
}

export async function listIgSources(): Promise<IgSourcesData> {
  return igSourcesData;
}
