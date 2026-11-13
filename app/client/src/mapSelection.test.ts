import { describe, expect, test } from "bun:test";
import {
  rowMapHighlightedEventId,
  selectAndFrameEvent,
  titleBubbleForHighlight,
  type HighlightTitleGroup,
} from "./mapSelection";

const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();

describe("frame-location actions", () => {
  test("an unselected card selects its occurrence and frames its own event directly", () => {
    const calls: string[] = [];

    selectAndFrameEvent({
      eventId: "tapped-event",
      occurrenceId: "tapped-occurrence",
      onSelectOccurrence: (occurrenceId) => calls.push(`select:${occurrenceId}`),
      onFrameEvent: (eventId) => calls.push(`frame:${eventId}`),
    });

    expect(calls).toEqual([
      "select:tapped-occurrence",
      "frame:tapped-event",
    ]);
  });

  test("feed cards do not expose a redundant frame-location button", () => {
    const eventCard = appSource.slice(
      appSource.indexOf("function EventCard("),
      appSource.indexOf("function EmptyState("),
    );
    const actionButtons = appSource.slice(
      appSource.indexOf("function EventActionButtons("),
      appSource.indexOf("function EventCard("),
    );

    expect(eventCard).not.toContain("onFrameSelected");
    expect(actionButtons).not.toContain("onFrameSelected");
    expect(actionButtons).not.toContain("event-frame-selected-button");
  });

  test("tapping a mappable tray card selects and frames that event", () => {
    const sharedTrayCards = appSource.slice(
      appSource.indexOf("function EventCardsTray("),
      appSource.indexOf("function MapView("),
    );

    expect(sharedTrayCards).toContain("onSelectMap={() => {");
    expect(sharedTrayCards).toContain("if (onFrameEvent && event.lat !== null && event.lng !== null)");
    expect(sharedTrayCards.match(/selectAndFrameEvent\(\{/g)).toHaveLength(1);
  });

  test("tray-card framing uses the same zoom as Option B minimaps", () => {
    expect(appSource).toContain("const OPTION_B_MINIMAP_ZOOM = 12;");
    expect(appSource).toContain("initialSelectedZoom: OPTION_B_MINIMAP_ZOOM");
    expect(appSource).toContain("frameSelectedControl.current?.(eventId, OPTION_B_MINIMAP_ZOOM)");
  });
});

describe("highlight title bubble", () => {
  // The map allows exactly one selected event at a time by construction:
  // highlightedEventId is the single selection state (the same state that
  // paints the green location highlight), and the title bubble is a pure
  // derivation from it. These tests check the derivation itself — for every
  // selection state, not just one tap/scroll sequence.
  const groups: HighlightTitleGroup[] = [
    {
      key: "40.75360,-73.98380",
      lat: 40.7536,
      lng: -73.9838,
      items: [{ event: { id: "juggling", venue: "Bryant Park" } }],
    },
    {
      key: "40.71150,-74.01130",
      lat: 40.7115,
      lng: -74.0113,
      items: [{ event: { id: "delta", venue: "The Oculus" } }],
    },
    {
      key: "40.75800,-73.98550",
      lat: 40.758,
      lng: -73.9855,
      items: [
        { event: { id: "first-show", venue: "Marquee Theater" } },
        { event: { id: "second-show", venue: "Marquee Theater — Stage Door" } },
      ],
    },
  ];
  const venueByEventId = new Map(
    groups.flatMap((group) => group.items.map(({ event }) => [event.id, event.venue] as const)),
  );
  const occurrences = [
    { event: { id: "juggling" }, occurrence: { id: "juggling-occ" } },
    { event: { id: "delta" }, occurrence: { id: "delta-occ" } },
  ];
  const highlightedEventIdFor = (selectedOccurrenceId: string | null) => (
    occurrences.find(({ occurrence }) => occurrence.id === selectedOccurrenceId)?.event.id ?? null
  );

  test("for every selection state, the displayed bubble is the highlighted event's — and there is exactly one", () => {
    const eventIds = [...venueByEventId.keys()];
    for (const highlightedEventId of [...eventIds, null, "filtered-out"]) {
      const bubble = titleBubbleForHighlight(groups, highlightedEventId, true);
      if (highlightedEventId === null || !venueByEventId.has(highlightedEventId)) {
        expect(bubble).toBeNull();
        continue;
      }
      // A single value, not a collection: one bubble can exist at a time.
      expect(bubble).not.toBeArray();
      expect(bubble?.content).toBe(venueByEventId.get(highlightedEventId));
      const anchor = groups.find((group) => (
        group.items.some(({ event }) => event.id === highlightedEventId)
      ))!;
      expect(bubble?.groupKey).toBe(anchor.key);
      expect(bubble?.lat).toBe(anchor.lat);
      expect(bubble?.lng).toBe(anchor.lng);
    }
  });

  test("the derivation has no other input: same highlight, same bubble, regardless of history", () => {
    // No notion of "which pin was tapped last" or "which bubble was open":
    // repeated and reordered evaluations of one highlight state agree.
    const first = titleBubbleForHighlight(groups, "delta", true);
    titleBubbleForHighlight(groups, "juggling", true);
    titleBubbleForHighlight(groups, "second-show", true);
    expect(titleBubbleForHighlight(groups, "delta", true)).toEqual(first);
    expect(first).toEqual({
      groupKey: "40.71150,-74.01130",
      lat: 40.7115,
      lng: -74.0113,
      content: "The Oculus",
    });
  });

  test("tap-path and scroll-path selection changes satisfy the same derivation", () => {
    // Tap path: selectAndFrameEvent writes the selected-occurrence state.
    let selectedOccurrenceId: string | null = "juggling-occ";
    selectAndFrameEvent({
      eventId: "delta",
      occurrenceId: "delta-occ",
      onSelectOccurrence: (occurrenceId) => { selectedOccurrenceId = occurrenceId; },
      onFrameEvent: () => {},
    });
    const viaTap = titleBubbleForHighlight(groups, highlightedEventIdFor(selectedOccurrenceId), true);

    // Scroll path: selectMostVisibleCard writes the same state directly —
    // no framing, no gesture-specific side effect.
    selectedOccurrenceId = "juggling-occ";
    const onSelectOccurrence = (occurrenceId: string) => { selectedOccurrenceId = occurrenceId; };
    onSelectOccurrence("delta-occ");
    const viaScroll = titleBubbleForHighlight(groups, highlightedEventIdFor(selectedOccurrenceId), true);

    expect(viaTap).toEqual({ groupKey: "40.71150,-74.01130", lat: 40.7115, lng: -74.0113, content: "The Oculus" });
    expect(viaScroll).toEqual(viaTap);
  });

  test("selection alone never conjures a bubble: unrequested means none for every highlight", () => {
    for (const highlightedEventId of [...venueByEventId.keys(), null]) {
      expect(titleBubbleForHighlight(groups, highlightedEventId, false)).toBeNull();
    }
  });

  test("a grouped pin titles the bubble with the highlighted event, not the group's first event", () => {
    expect(titleBubbleForHighlight(groups, "second-show", true)).toEqual({
      groupKey: "40.75800,-73.98550",
      lat: 40.758,
      lng: -73.9855,
      content: "Marquee Theater — Stage Door",
    });
    expect(titleBubbleForHighlight(groups, "first-show", true)?.content).toBe("Marquee Theater");
  });

  test("no per-pin title state remains: the previous fix's machinery is gone", () => {
    for (const removed of [
      "bindTooltip",
      "setTooltipContent",
      "isTooltipOpen",
      "openTooltip",
      "closeTooltip",
      "tooltipFollowsSelection",
      "resolveSelectionBubble",
      "pinBubbleForSelection",
    ]) {
      expect(appSource).not.toContain(removed);
    }
  });

  test("exactly one bubble exists in the component: a single standalone tooltip, fed only by the derivation", () => {
    expect(appSource.match(/L\.tooltip\(/g)).toHaveLength(1);
    expect(appSource.match(/titleBubbleForHighlight\(pinGroups, highlightedEventId, titleBubbleRequested\)/g)).toHaveLength(1);
    expect(appSource).toContain("titleBubbleInstance");
    // The one tooltip is positioned and labeled from the derived bubble —
    // never from any group's or marker's own stored state.
    const applyIndex = appSource.indexOf("titleBubbleForHighlight(pinGroups, highlightedEventId, titleBubbleRequested)");
    const applyBlock = appSource.slice(applyIndex, appSource.indexOf("if (panToSelection && selectedGroup", applyIndex));
    expect(applyBlock).toContain("tooltip.setLatLng([bubble.lat, bubble.lng]).setContent(bubbleTextNode)");
    expect(applyBlock).toContain("tooltip.addTo(map)");
    // The venue string reaches the tooltip only as a text node: Leaflet
    // renders string content as HTML, and venue is third-party-sourced.
    expect(applyBlock).toContain("bubbleTextNode.textContent = bubble.content");
    expect(applyBlock).not.toContain("setContent(bubble.content)");
  });

  test("the bubble is derived inside the same highlight application that sets the pin icon", () => {
    const iconIndex = appSource.indexOf("marker?.setIcon(eventMarkerIcon(group, highlightedEventId))");
    const bubbleIndex = appSource.indexOf("titleBubbleForHighlight(pinGroups, highlightedEventId, titleBubbleRequested)");
    const panIndex = appSource.indexOf("if (panToSelection && selectedGroup", bubbleIndex);

    expect(iconIndex).toBeGreaterThan(-1);
    expect(bubbleIndex).toBeGreaterThan(iconIndex);
    expect(panIndex).toBeGreaterThan(bubbleIndex);
  });

  test("a pin tap requests the bubble and writes selection through the same handler — it sets no title itself", () => {
    const markerClick = appSource.slice(
      appSource.indexOf('marker.on("click"'),
      appSource.indexOf("markerInstances.current.set(group.key, marker)"),
    );
    expect(markerClick).toContain("setTitleBubbleRequested(true)");
    expect(markerClick).toContain("onSelectOccurrenceRef.current(group.items[0]!.occurrence.id)");
    expect(markerClick).not.toContain("venue");
    expect(markerClick).not.toContain("Tooltip");
  });
});

describe("Option B row map highlight", () => {
  test("an inline minimap highlights its attached event, not the shared selection", () => {
    expect(rowMapHighlightedEventId({
      attachedEventId: "row-event",
      sharedSelectedEventId: "shared-event",
      fullscreen: false,
    })).toBe("row-event");
  });

  test("the fullscreen map follows the shared selected event used by its event tray", () => {
    expect(rowMapHighlightedEventId({
      attachedEventId: "row-event",
      sharedSelectedEventId: "shared-event",
      fullscreen: true,
    })).toBe("shared-event");
  });

  test("fullscreen falls back to its attached event before shared selection initializes", () => {
    expect(rowMapHighlightedEventId({
      attachedEventId: "row-event",
      sharedSelectedEventId: null,
      fullscreen: true,
    })).toBe("row-event");
  });
});
