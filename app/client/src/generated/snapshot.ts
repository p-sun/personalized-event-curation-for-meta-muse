// GENERATED at publish time from the publish payload — never hand-edit.
// (Kit, Part F step 8: regenerating this module is the static publish.)
//
// The typed exports are the static build's whole dataset: the payload's
// events, the full location list, and the sources list, in exactly the
// shapes the server actions return. Regeneration replaces the three
// constants below with the payload's data, keeping their names and
// types. The stub shipped in the bundle is the empty dataset a fresh
// static build renders before its first publish.

import type { api, ApiResponse } from "../api";

export type EventsData = ApiResponse<typeof api, "list_events">;
export type LocationsData = ApiResponse<typeof api, "list_locations">;
export type IgSourcesData = ApiResponse<typeof api, "list_ig_sources">;

export const eventsData: EventsData = {
  events: [],
  favorite_ids: [],
  last_synced_at: null,
};

export const locationsData: LocationsData = { locations: [] };

export const igSourcesData: IgSourcesData = { sources: [] };
