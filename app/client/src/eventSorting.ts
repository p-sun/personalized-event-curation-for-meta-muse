export type EventSortMode = "ig_mentions" | "distance";

export type UserCoordinates = {
  lat: number;
  lng: number;
};

type SortableOccurrence = {
  event: {
    id: string;
    title: string;
    lat: number | null;
    lng: number | null;
    ig_mention_count: number;
  };
  occurrence: {
    id: string;
    start_date: string;
    end_date: string | null;
  };
};

const EARTH_RADIUS_KM = 6_371.0088;

function degreesToRadians(value: number): number {
  return value * Math.PI / 180;
}

export function distanceInKilometers(from: UserCoordinates, to: UserCoordinates): number {
  const latitudeDelta = degreesToRadians(to.lat - from.lat);
  const longitudeDelta = degreesToRadians(to.lng - from.lng);
  const fromLatitude = degreesToRadians(from.lat);
  const toLatitude = degreesToRadians(to.lat);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

function eventDistance(
  event: SortableOccurrence["event"],
  userLocation: UserCoordinates | null,
): number {
  if (!userLocation || event.lat === null || event.lng === null) return Number.POSITIVE_INFINITY;
  return distanceInKilometers(userLocation, { lat: event.lat, lng: event.lng });
}

function firstVisibleDate(occurrence: SortableOccurrence["occurrence"], rangeStart: string | null): string {
  if (!rangeStart || occurrence.start_date >= rangeStart) return occurrence.start_date;
  return rangeStart;
}

type Comparator<T> = (a: T, b: T) => number;

function compareBy<T>(comparators: Array<Comparator<T>>, a: T, b: T): number {
  for (const comparator of comparators) {
    const order = comparator(a, b);
    if (order !== 0) return order;
  }
  return 0;
}

/**
 * Sorts by an explicit list of keys. The first visible day is always primary:
 * an occurrence that began before the selected range is grouped with the
 * range's first day rather than jumping ahead of that day's events.
 *
 * Distance mode: visible day, distance, IG mentions, deterministic identity.
 * IG mode: visible day, IG mentions, distance, deterministic identity.
 */
export function sortEventOccurrences<T extends SortableOccurrence>(
  occurrences: T[],
  mode: EventSortMode,
  userLocation: UserCoordinates | null,
  rangeStart: string | null = null,
): T[] {
  const byVisibleDay: Comparator<T> = (a, b) => (
    firstVisibleDate(a.occurrence, rangeStart).localeCompare(firstVisibleDate(b.occurrence, rangeStart))
  );
  const byDistance: Comparator<T> = (a, b) => {
    const aDistance = eventDistance(a.event, userLocation);
    const bDistance = eventDistance(b.event, userLocation);
    if (aDistance === bDistance) return 0;
    return aDistance < bDistance ? -1 : 1;
  };
  const byMentions: Comparator<T> = (a, b) => b.event.ig_mention_count - a.event.ig_mention_count;
  const byIdentity: Comparator<T> = (a, b) => (
    a.event.title.localeCompare(b.event.title)
    || a.event.id.localeCompare(b.event.id)
    || a.occurrence.id.localeCompare(b.occurrence.id)
  );

  const comparators = mode === "distance"
    ? [byVisibleDay, byDistance, byMentions, byIdentity]
    : [byVisibleDay, byMentions, byDistance, byIdentity];

  return [...occurrences].sort((a, b) => compareBy(comparators, a, b));
}
