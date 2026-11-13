// Client data seam: the single module through which the UI reads its data.
//
// This fullstack implementation delegates to the server actions via the typed
// RPC proxy in ./api.ts. The static build replaces this one file's
// implementation with the baked snapshot, returning the same three shapes:
// { events, favorite_ids, last_synced_at }, { locations }, and { sources }.
//
// The seam is reads only: no arguments, no filtering, no writes. Filtering
// runs client-side over the full lists, and favorites/hides are local-only
// (see ./localPreferences.ts), so they never appear here.

import { api, type ApiResponse } from "./api";

export type EventsData = ApiResponse<typeof api, "list_events">;
export type LocationsData = ApiResponse<typeof api, "list_locations">;
export type IgSourcesData = ApiResponse<typeof api, "list_ig_sources">;

export async function listEvents(): Promise<EventsData> {
  return api.list_events({});
}

export async function listLocations(): Promise<LocationsData> {
  return api.list_locations({});
}

export async function listIgSources(): Promise<IgSourcesData> {
  return api.list_ig_sources({});
}
