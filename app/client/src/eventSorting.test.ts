import { describe, expect, test } from "bun:test";
import { distanceInKilometers, sortEventOccurrences, type EventSortMode } from "./eventSorting";

type Row = {
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

function row(
  id: string,
  date: string,
  mentions: number,
  coordinates: { lat: number; lng: number } | null,
  endDate = date,
): Row {
  return {
    event: {
      id,
      title: id,
      lat: coordinates?.lat ?? null,
      lng: coordinates?.lng ?? null,
      ig_mention_count: mentions,
    },
    occurrence: { id: `${id}-${date}`, start_date: date, end_date: endDate },
  };
}

const USER_LOCATION = { lat: 40.758, lng: -73.9855 };

function ids(rows: Row[], mode: EventSortMode, rangeStart: string | null = null) {
  return sortEventOccurrences(rows, mode, USER_LOCATION, rangeStart).map(({ event }) => event.id);
}

describe("event sorting", () => {
  test("keeps visible dates primary and sorts each day by descending IG mentions", () => {
    const rows = [
      row("later-popular", "2026-09-15", 100, USER_LOCATION),
      row("today-less", "2026-09-14", 2, USER_LOCATION),
      row("today-popular", "2026-09-14", 8, USER_LOCATION),
    ];

    expect(ids(rows, "ig_mentions")).toEqual(["today-popular", "today-less", "later-popular"]);
  });

  test("groups an in-progress range with the first selected day instead of its elapsed start date", () => {
    const rows = [
      row("started-yesterday", "2026-09-11", 1, USER_LOCATION, "2026-09-13"),
      row("popular-on-the-12th", "2026-09-12", 8, USER_LOCATION),
      row("on-the-13th", "2026-09-13", 100, USER_LOCATION),
    ];

    expect(ids(rows, "ig_mentions", "2026-09-12")).toEqual([
      "popular-on-the-12th",
      "started-yesterday",
      "on-the-13th",
    ]);
  });

  test("uses date, distance, then IG mentions in distance mode", () => {
    const sameCoordinates = { lat: 40.759, lng: -73.9855 };
    const rows = [
      row("later-nearest", "2026-09-15", 100, USER_LOCATION),
      row("today-far", "2026-09-14", 50, { lat: 40.70, lng: -74.01 }),
      row("today-near-less-mentioned", "2026-09-14", 2, sameCoordinates),
      row("today-near-popular", "2026-09-14", 8, sameCoordinates),
      row("today-unknown", "2026-09-14", 100, null),
    ];

    expect(ids(rows, "distance")).toEqual([
      "today-near-popular",
      "today-near-less-mentioned",
      "today-far",
      "today-unknown",
      "later-nearest",
    ]);
  });

  test("uses date, IG mentions, then distance in IG mode", () => {
    const rows = [
      row("later-popular", "2026-09-15", 100, USER_LOCATION),
      row("today-equally-popular-far", "2026-09-14", 8, { lat: 40.70, lng: -74.01 }),
      row("today-equally-popular-near", "2026-09-14", 8, { lat: 40.759, lng: -73.9855 }),
      row("today-less-mentioned", "2026-09-14", 2, USER_LOCATION),
    ];

    expect(ids(rows, "ig_mentions")).toEqual([
      "today-equally-popular-near",
      "today-equally-popular-far",
      "today-less-mentioned",
      "later-popular",
    ]);
  });

  test("uses deterministic title and id tie breakers", () => {
    const rows = [
      row("z-event", "2026-09-14", 2, USER_LOCATION),
      row("a-event", "2026-09-14", 2, USER_LOCATION),
    ];

    expect(ids(rows, "ig_mentions")).toEqual(["a-event", "z-event"]);
    expect(ids(rows, "distance")).toEqual(["a-event", "z-event"]);
  });

  test("computes a zero distance for identical coordinates", () => {
    expect(distanceInKilometers(USER_LOCATION, USER_LOCATION)).toBe(0);
  });
});
