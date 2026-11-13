import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const themeCss = readFileSync(new URL("./theme.css", import.meta.url), "utf8");

function componentSource(start: string, end: string) {
  return appSource.slice(appSource.indexOf(start), appSource.indexOf(end));
}

function declaration(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return themeCss.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "m"))?.[1] ?? "";
}

describe("Option C fullscreen-exit tray physics", () => {
  test("exit keeps the mounted tray in one stable map-stage coordinate and hit-test space", () => {
    const exploreView = componentSource("function ExploreView(", "function LocationView(");
    const mapWithCards = componentSource("function MapWithEventCards(", "function ExploreView(");

    // Exact device sequence: entering Option C starts this same map/tray tree in
    // fullscreen, then the map control toggles the stage out of fullscreen.
    expect(exploreView).toContain("const fullscreen = useMapFullscreen(true)");
    expect(exploreView).toContain("fullscreen={fullscreen.active}");
    expect(exploreView).toContain("onToggleFullscreen={fullscreen.toggle}");

    // The tray stays mounted across that toggle; only the shared stage changes
    // geometry. The map remains the first-painted underlay inside the stage.
    expect(mapWithCards).toContain('className={`explore-map-stage ${fullscreen ? "is-fullscreen" : ""}`}');
    expect(mapWithCards).toContain("<EventMap");
    expect(mapWithCards.indexOf("<EventCardsTray")).toBeGreaterThan(mapWithCards.indexOf("{fullscreen && ("));

    // The stage owns the map, filters, and tray in both modes. Its absolute
    // tray therefore keeps one coordinate and hit-test space across fullscreen
    // exit, while remaining a sibling of the clipped Leaflet underlay instead
    // of being trapped inside it.
    expect(declaration(".explore-sheet")).toContain("position: absolute");
    expect(declaration(".explore-sheet")).not.toContain("position: fixed");
    expect(declaration(".explore-map-stage")).toContain("position: relative");
    expect(declaration(".explore-map-stage.is-fullscreen")).toContain("position: fixed");
  });

  test("the first handle drag after exit still reaches the shared gesture-and-spring path", () => {
    const tray = componentSource("function ModalTray(", "function useProgrammaticScrollGuard(");

    expect(tray).toContain("onPointerDown={startDrag}");
    expect(tray).toContain("onPointerMove={moveTray}");
    expect(tray).toContain("onPointerUp={finishDrag}");
    expect(tray).toContain("heightAtRelease: drag.ownedGeometry.currentHeight");
    expect(tray).toContain("releaseTrayPosition(heightAtRelease, drag.velocityPxPerMs, snaps)");
    expect(tray).toContain("settleAt(nextPosition, drag.velocityPxPerMs)");
  });

  test("native content momentum and one-shot top-edge sheet arbitration stay separate", () => {
    const tray = componentSource("function ModalTray(", "function useProgrammaticScrollGuard(");
    const scroller = declaration(".explore-sheet-scroll");

    // The list remains a compositor-backed native scroller. Upward gestures
    // stay native, with no reimplemented inertia. A pull-down that starts at
    // the tolerant top boundary is intercepted from its first pixel so iOS
    // rubber-band cannot cancel the stream before the 8px sheet threshold.
    expect(scroller).toContain("overflow-y: auto");
    expect(scroller).toContain("touch-action: pan-y");
    expect(scroller).not.toContain("touch-action: none");
    expect(tray).toContain("const activationDistance = 8");
    expect(tray).toContain('scrollElement.addEventListener("touchmove", onTouchMove, { passive: false })');
    expect(tray).toContain("totalFingerDelta > 0 && isScrollAtTop(scrollElement.scrollTop)");
    expect(tray).toContain("event.preventDefault()");
    expect(tray).toContain("advanceTrayContentGesture(");
    expect(tray).toContain("releaseTrayContentGesture(touchGesture.state, snaps())");
    expect(tray).toContain("scrollElement.scrollTop = 0");
    expect(tray).not.toContain("startContentMomentum");
    expect(tray).not.toContain("advanceContentMomentum");
  });

  test("scroll, card-frame tap, then immediate drag does not wait for a card compositor transition", () => {
    const eventCardsTray = componentSource("function EventCardsTray(", "function MapView(");
    const selectedCard = declaration(".explore-card-anchor .event-card.explore-selected");
    const cardBase = declaration(".explore-card-anchor .event-card");

    // The exact second sequence reaches the frame action from a card inside the
    // pointer-owned scroller, then starts another gesture on the same tray.
    expect(eventCardsTray).toContain("onSelectMap={() => {");
    expect(eventCardsTray).toContain("selectAndFrameEvent({");
    expect(eventCardsTray).toContain("onFrameEvent,");

    // Moving the selected card onto a transient transform layer made WebKit
    // rebuild the hit-test region of the enclosing fixed tray. Touches that
    // began before that compositor commit were dropped, then began working at
    // once when the 200ms transition ended. Selection may restyle the card,
    // but it must not move it into a new compositor layer.
    expect(selectedCard).not.toMatch(/(?:^|;)\s*transform\s*:/);
    expect(cardBase).not.toMatch(/transition:[^;]*transform/);
  });
});
