// City configuration: the single module holding this app's city-specific
// values — the map's reference anchor and preferred bounds, the timezone the
// landing-day logic reads the clock in, and the preferences storage key.
// Everything else in the client is city-agnostic; retargeting the app to
// another city means changing this file.

// Every map uses a familiar Midtown reference point whenever an event falls
// outside the user's Manhattan-first browsing area. The outlying event and
// Midtown are then guaranteed to share the initial viewport.
export const MID_MANHATTAN_ANCHOR: { lat: number; lng: number } = { lat: 40.758, lng: -73.9855 };
export const PREFERRED_MANHATTAN_BOUNDS = {
  south: 40.70,
  north: 40.88,
  west: -74.02,
  east: -73.925,
};

/** The timezone the landing-day logic (nycDateParts) reads the clock in. */
export const CITY_TIME_ZONE = "America/New_York";

/**
 * The localStorage key for the single preferences record. The value is part
 * of the stored-data contract: changing it would orphan every existing
 * saved preferences record.
 */
export const PREFERENCES_STORAGE_KEY = "things-to-do:preferences:v2";
