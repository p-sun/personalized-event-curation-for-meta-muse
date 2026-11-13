import { describe, expect, test } from "bun:test";
import { MAX_NUMBERED_FILTERED_ITEMS, numberFilteredItems } from "./numberFilteredItems";

describe("numberFilteredItems", () => {
  test("numbers filtered items in their display order", () => {
    expect(numberFilteredItems(["third", "fifth"]).map(({ displayNumber }) => displayNumber)).toEqual([1, 2]);
  });

  test("gives every occurrence of an event the number from its first date", () => {
    const occurrences = [
      { eventId: "event-a", date: "2026-10-03" },
      { eventId: "event-b", date: "2026-10-04" },
      { eventId: "event-a", date: "2026-10-06" },
    ];

    const numbered = numberFilteredItems(occurrences, (item) => item.eventId);
    expect(numbered.map(({ eventNumber }) => eventNumber)).toEqual([1, 2, 1]);
    expect(numbered.map(({ displayNumber }) => displayNumber)).toEqual([1, 2, 1]);
  });

  test("keeps deterministic numbers for all events while hiding labels after 99", () => {
    const numbered = numberFilteredItems(
      Array.from({ length: 101 }, (_, index) => ({ eventId: `event-${String(index + 1).padStart(3, "0")}` })),
      (item) => item.eventId,
    );

    expect(numbered[MAX_NUMBERED_FILTERED_ITEMS - 1]).toMatchObject({ eventNumber: 99, displayNumber: 99 });
    expect(numbered[MAX_NUMBERED_FILTERED_ITEMS]).toMatchObject({ eventNumber: 100, displayNumber: null });
    expect(numbered[100]).toMatchObject({ eventNumber: 101, displayNumber: null });
  });
});
