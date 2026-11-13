const GOOGLE_MAPS_DIRECTIONS_BASE = "https://www.google.com/maps/dir/";

/**
 * Builds a Google Maps directions link. The origin is intentionally omitted
 * so Google Maps can use the device's current location after the link opens.
 */
export function googleMapsDirectionsUrl(destination: string): string | null {
  const trimmedDestination = destination.trim();
  if (!trimmedDestination) return null;

  const params = new URLSearchParams({
    api: "1",
    destination: trimmedDestination,
    travelmode: "walking",
  });
  return `${GOOGLE_MAPS_DIRECTIONS_BASE}?${params.toString()}`;
}
