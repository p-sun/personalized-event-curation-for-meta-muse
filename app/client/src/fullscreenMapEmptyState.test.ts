import { describe, expect, test } from "bun:test";

const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();

describe("fullscreen map zero-result state", () => {
  test("Option C keeps the shared map mounted when filters return no occurrences", () => {
    const exploreView = appSource.slice(
      appSource.indexOf("function ExploreView("),
      appSource.indexOf("function LocationView("),
    );

    expect(exploreView).toContain("<MapWithEventCards");
    expect(exploreView).not.toContain("occurrences.length === 0 ?");
  });

  test("the shared fullscreen experience renders an empty tray over the basemap", () => {
    const tray = appSource.slice(
      appSource.indexOf("function EventCardsTray("),
      appSource.indexOf("function MapView("),
    );
    const sharedMap = appSource.slice(
      appSource.indexOf("function MapWithEventCards("),
      appSource.indexOf("function ExploreView("),
    );

    expect(tray).toContain('className="no-results explore-no-results"');
    expect(tray).toContain("No matches in this view.");
    expect(sharedMap).toContain("<EventMap");
    expect(sharedMap).not.toContain("mappable.length > 0 ?");
  });

  test("EventMap initializes an empty basemap at the Manhattan overview", () => {
    const eventMap = appSource.slice(
      appSource.indexOf("function EventMap("),
      appSource.indexOf("function FeedTrayMap("),
    );

    expect(eventMap).not.toMatch(/if \(pinGroups\.length === 0\) return \(/);
    expect(eventMap).toContain("anchor: MID_MANHATTAN_ANCHOR");
    expect(eventMap).toContain("zoom: initialSelectedZoom ?? 12");
  });
});
