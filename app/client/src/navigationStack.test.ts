import { describe, expect, test } from "bun:test";
import { popNavigationEntry, pushNavigationEntry, type NavigationEntry } from "./navigationStack";

type Route = { type: "location"; locationId: string } | { type: "ig-sources" };

describe("navigation stack", () => {
  test("push preserves the existing mounted route order", () => {
    const first: NavigationEntry<Route> = {
      id: "screen-1",
      route: { type: "location", locationId: "bryant-park" },
    };
    const result = pushNavigationEntry(
      [first],
      { type: "location", locationId: "times-square" },
      "screen-2",
    );

    expect(result).toEqual([
      first,
      { id: "screen-2", route: { type: "location", locationId: "times-square" } },
    ]);
  });

  test("push supports the IG sources route", () => {
    expect(pushNavigationEntry<Route>([], { type: "ig-sources" }, "screen-1")).toEqual([
      { id: "screen-1", route: { type: "ig-sources" } },
    ]);
  });

  test("pop removes only the top route", () => {
    const entries: NavigationEntry<Route>[] = [
      { id: "screen-1", route: { type: "location", locationId: "bryant-park" } },
      { id: "screen-2", route: { type: "location", locationId: "times-square" } },
    ];

    expect(popNavigationEntry(entries)).toEqual([entries[0]!]);
    expect(entries).toHaveLength(2);
  });

  test("popping the root is a safe no-op", () => {
    expect(popNavigationEntry<Route>([])).toEqual([]);
  });
});
