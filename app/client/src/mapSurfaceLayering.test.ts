import { describe, expect, test } from "bun:test";

const themeCss = await Bun.file(new URL("./theme.css", import.meta.url)).text();
const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();

const declaration = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return themeCss.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
};

describe("map surface layering", () => {
  test("the shared popup stays above Option A's fixed map surfaces", () => {
    const zIndexDeclarations = themeCss.match(/z-index\s*:/g) ?? [];
    expect(zIndexDeclarations).toHaveLength(3);
    expect(declaration(".popup-menu-layer")).toContain("z-index: 3");
    expect(declaration(".feed-tray-layer")).toContain("z-index: 1");
    expect(declaration(".feed-map-toggle")).toContain("z-index: 1");
    expect(appSource.match(/<PopupMenu\n/g)).toHaveLength(4);
    expect(appSource).toContain('menuClassName="settings-popover"');
    expect(appSource).toContain('menuClassName="category-menu"');
    expect(appSource).toContain('menuClassName="sort-menu"');
    expect(appSource).toContain('menuClassName="calendar-popover"');
  });

  test("ordinary UI surfaces rely on component order", () => {
    for (const selector of [
      ".page-intro",
      ".view-options",
      ".discovery-tools",
      ".category-picker",
      ".explore-map-stage",
      ".modal-tray",
      ".modal-tray-surface",
      ".modal-tray-handle",
      ".map-floating-controls",
    ]) {
      expect(declaration(selector)).not.toContain("z-index");
    }

    const mainComposition = appSource.slice(
      appSource.indexOf('<div className="app-shell">'),
      appSource.indexOf("</NavigationStack>"),
    );
    const pageFilters = mainComposition.indexOf('<section className="discovery-tools"');
    const optionC = mainComposition.indexOf("<ExploreView", pageFilters);
    expect(pageFilters).toBeGreaterThan(-1);
    expect(optionC).toBeGreaterThan(pageFilters);

    const sharedMapExperience = appSource.slice(
      appSource.indexOf("function MapWithEventCards("),
      appSource.indexOf("function ExploreView("),
    );
    const composition = sharedMapExperience.indexOf("className={`explore-map-stage");
    const map = sharedMapExperience.indexOf("<EventMap", composition);
    const filters = sharedMapExperience.indexOf("<FullscreenMapFilters", map);
    const traySurface = sharedMapExperience.indexOf("<EventCardsTray", filters);
    expect(composition).toBeGreaterThan(-1);
    expect(map).toBeGreaterThan(composition);
    expect(filters).toBeGreaterThan(map);
    expect(traySurface).toBeGreaterThan(filters);

    const tray = appSource.slice(
      appSource.indexOf("function ModalTray("),
      appSource.indexOf("function useProgrammaticScrollGuard("),
    );
    expect(tray.indexOf('className="modal-tray-content"')).toBeLessThan(tray.indexOf('className="modal-tray-handle"'));
    expect(declaration(".map-canvas")).toContain("isolation: isolate");
  });

  test("a collapsed Option C map keeps the map stage as the 80dvh clipped underlay", () => {
    const mapStage = declaration(".explore-map-stage");

    // The collapsed map is an 80dvh in-flow box. The stage owns Leaflet's
    // clipping and isolation; the tray is absolutely positioned inside it.
    expect(mapStage).toContain("height: 80dvh");
    expect(mapStage).toContain("overflow: hidden");
    expect(mapStage).toContain("isolation: isolate");

    const sharedMapExperience = appSource.slice(
      appSource.indexOf("function MapWithEventCards("),
      appSource.indexOf("function ExploreView("),
    );
    expect(sharedMapExperience.indexOf("className={`explore-map-stage"))
      .toBeLessThan(sharedMapExperience.indexOf("<EventCardsTray"));
    expect(appSource).toContain('{ id: "full", viewportFraction: 0.95 }');
  });

  test("Option A keeps its enlarged map toggle at the bottom-right and its tray fixed at 35%", () => {
    expect(appSource).toContain('const OPTION_A_TRAY_POSITIONS: readonly TraySnapDefinition[] = Object.freeze([\n  { id: "middle", viewportFraction: 0.35 },\n]);');
    const mapToggle = declaration(".feed-map-toggle");
    expect(mapToggle).toContain("right: var(--feed-map-toggle-right)");
    expect(mapToggle).not.toContain("left:");
    expect(mapToggle).toContain("--feed-map-toggle-size: 64px");
    expect(mapToggle).toContain("width: var(--feed-map-toggle-size)");
    expect(mapToggle).toContain("height: var(--feed-map-toggle-size)");
    expect(mapToggle).toContain("bottom: calc(12px + env(safe-area-inset-bottom))");
    expect(declaration(".map-floating-controls")).toContain("top: calc(12px + env(safe-area-inset-top) + var(--map-controls-top-offset, 0px))");
  });

  test("one shared configuration gives every fullscreen map tray only 40% and 95% detents", () => {
    expect(appSource.match(/const MAP_EVENT_TRAY_POSITIONS/g)).toHaveLength(1);
    expect(appSource).toContain('const MAP_EVENT_TRAY_POSITIONS: readonly TraySnapDefinition[] = Object.freeze([\n  { id: "middle", viewportFraction: 0.4 },\n  { id: "full", viewportFraction: 0.95 },\n]);');
    expect(appSource).not.toContain('viewportFraction: 0.16');

    const sharedMapExperience = appSource.slice(
      appSource.indexOf("function MapWithEventCards("),
      appSource.indexOf("function ExploreView("),
    );
    expect(sharedMapExperience).toContain("positions={MAP_EVENT_TRAY_POSITIONS}");
    expect(sharedMapExperience).not.toContain("trayPositions");
    expect(appSource).not.toContain("OPTION_C_TRAY_POSITIONS");
    expect(appSource).toContain('heightPx >= viewportHeightRef.current - 0.5 ? "is-viewport-full" : ""');
    expect(appSource).not.toContain('position === "full" && !dragging ? "is-full"');
    expect(declaration(".modal-tray.is-full")).toBe("");
    expect(declaration(".modal-tray.is-collapsed")).toBe("");
    expect(appSource).not.toContain("handleOnly");
    expect(appSource).not.toContain("is-collapsed");
    expect(declaration(".modal-tray.is-viewport-full .modal-tray-surface")).toContain("border-radius: 0");
    expect(themeCss).toMatch(/\.map-stage\.is-fullscreen \.explore-sheet,[\s\S]*?\.explore-map-stage\.is-fullscreen \.explore-sheet[\s\S]*?bottom: 0;/);
  });

  test("all three options mount fullscreen directly without a transition layer", () => {
    expect(appSource.match(/<MapWithEventCards/g)).toHaveLength(3);
    expect(appSource).not.toContain("<ViewTransition");
    expect(appSource).not.toContain("transitionActive");

    const sharedMapExperience = appSource.slice(
      appSource.indexOf("function MapWithEventCards("),
      appSource.indexOf("function ExploreView("),
    );
    expect(sharedMapExperience).toContain("{fullscreen && (");
    expect(sharedMapExperience).toContain("<FullscreenMapFilters");
    expect(sharedMapExperience).toContain('className={`explore-map-stage ${fullscreen ? "is-fullscreen" : ""}`}');
    expect(sharedMapExperience).not.toContain("trayPosition");

    const exploreView = appSource.slice(
      appSource.indexOf("function ExploreView("),
      appSource.indexOf("function LocationView("),
    );
    expect(exploreView).toContain("const fullscreen = useMapFullscreen(true)");
    expect(exploreView).toContain("<MapWithEventCards");

    const rowMap = appSource.slice(
      appSource.indexOf("function EventRowMap("),
      appSource.indexOf("function MapEventCard("),
    );
    expect(rowMap).toContain("<EventMap");
    expect(rowMap).toContain('className="map-row-canvas"');
    expect(rowMap).toContain("highlightedEventId={item.event.id}");
    expect(rowMap).toContain("fullscreen.active && createPortal(");
    expect(rowMap).not.toContain("<EventCardsTray");

    const feedTrayMap = appSource.slice(
      appSource.indexOf("function FeedTrayMap("),
      appSource.indexOf("function EventRowMap("),
    );
    expect(feedTrayMap).toContain("<EventMap");
    expect(feedTrayMap).toContain('className="feed-tray-map-canvas"');
    expect(feedTrayMap).toContain("fullscreenActive && createPortal(");
    expect(feedTrayMap).toContain("<MapWithEventCards");
  });

  test("fullscreen exits from the first filter-row control while ordinary maps keep expand", () => {
    const eventMap = appSource.slice(
      appSource.indexOf("function EventMap("),
      appSource.indexOf("function FeedTrayMap("),
    );
    const sharedMap = appSource.slice(
      appSource.indexOf("function MapWithEventCards("),
      appSource.indexOf("function ExploreView("),
    );
    const fullscreenFilters = appSource.slice(
      appSource.indexOf("function FullscreenMapFilters("),
      appSource.indexOf("function FitMapIcon("),
    );
    const zoomControls = eventMap.indexOf('aria-label="Map zoom"');
    const fullscreenControl = eventMap.indexOf('aria-label={fullscreenControl.active ? "Exit full screen map"');
    expect(fullscreenControl).toBeGreaterThan(-1);
    expect(fullscreenControl).toBeLessThan(zoomControls);
    expect(eventMap).toContain('className={`map-fullscreen-toggle ${fullscreenControl.active ? "is-active" : ""}`}');
    expect(sharedMap).toContain("fullscreenControl={fullscreen ? undefined : { active: false, onToggle: onToggleFullscreen }}");
    expect(sharedMap).toContain("onBack={onToggleFullscreen}");
    expect(fullscreenFilters.indexOf('className="location-back fullscreen-map-back"'))
      .toBeLessThan(fullscreenFilters.indexOf('className={`fullscreen-filter-toggle ${activeFilterCount > 0 ? "has-active-filters" : ""}`}'));
    expect(eventMap).not.toContain('aria-label="Frame selected pin"');
    expect(declaration(".map-floating-controls")).toContain("left: calc(12px + env(safe-area-inset-left))");
    expect(declaration(".map-floating-controls")).not.toContain("right:");
    expect(declaration(".map-floating-controls")).toContain("justify-items: start");
    expect(declaration(".map-floating-controls")).toContain("top: calc(12px + env(safe-area-inset-top) + var(--map-controls-top-offset, 0px))");
    expect(declaration(".map-floating-controls")).not.toContain("bottom:");
    expect(eventMap).toContain('"--map-controls-top-offset": `${controlsTopOffsetPx}px`');
    expect(eventMap).toContain("mapControlsTopOffset(mapRect.top, overlayRect.bottom)");
  });

  test("tapping a tray card frames its pin without a redundant frame button", () => {
    const actionButtons = appSource.slice(
      appSource.indexOf("function EventActionButtons("),
      appSource.indexOf("function EventCard("),
    );
    expect(actionButtons).toContain("Route <ExternalIcon />");
    expect(actionButtons).not.toContain("event-frame-selected-button");
    expect(actionButtons).not.toContain("onFrameSelected");
    const eventCardsTray = appSource.slice(
      appSource.indexOf("function EventCardsTray("),
      appSource.indexOf("function MapView("),
    );
    expect(eventCardsTray).toContain("onSelectMap={() => {");
    expect(eventCardsTray).toContain("selectAndFrameEvent({");
    expect(themeCss).not.toContain(".event-frame-selected-button");
  });

  test("tapping an Option A feed card frames its pin at the Option B minimap zoom", () => {
    const feedView = appSource.slice(
      appSource.indexOf("function FeedView("),
      appSource.indexOf("function DateFilterControl("),
    );
    expect(feedView).toContain("const frameSelectedControl = useRef<FrameEventOnMap | null>(null)");
    expect(feedView).toContain("selectAndFrameEvent({");
    expect(feedView).toContain("frameSelectedControl.current?.(eventId, OPTION_B_MINIMAP_ZOOM)");
    expect(feedView).toContain("frameSelectedControlRef={frameSelectedControl}");

    const feedTrayMap = appSource.slice(
      appSource.indexOf("function FeedTrayMap("),
      appSource.indexOf("function EventRowMap("),
    );
    expect(feedTrayMap).toContain("frameSelectedControlRef?: RefObject<FrameEventOnMap | null>");
    expect(feedTrayMap).toContain("frameSelectedControlRef={frameSelectedControlRef}");
    expect(feedTrayMap).toContain("<EventMap");
    expect(feedTrayMap).toContain("createPortal(");
    expect(feedTrayMap).not.toContain("controlsConfig=");
  });

  test("card-driven framing animates the map to the tapped event", () => {
    const eventMap = appSource.slice(
      appSource.indexOf("function EventMap("),
      appSource.indexOf("function FeedTrayMap("),
    );
    const focusEvent = eventMap.slice(
      eventMap.indexOf("const focusEvent ="),
      eventMap.indexOf("useEffect(() => {", eventMap.indexOf("const focusEvent =")),
    );
    expect(focusEvent).toContain('frameMap({ kind: "point", anchor: targetGroup, zoom }, true)');
    expect(eventMap).toContain('map.flyTo(center, subject.zoom, { duration: .45 })');
  });

  test("native list momentum stays intact while only top-edge downward starts move the tray", () => {
    const tray = appSource.slice(
      appSource.indexOf("function ModalTray("),
      appSource.indexOf("function useProgrammaticScrollGuard("),
    );
    expect(tray).toContain("advanceTrayContentGesture(");
    expect(tray).toContain('scrollElement.addEventListener("touchmove", onTouchMove, { passive: false })');
    expect(tray).toContain("totalFingerDelta > 0 && isScrollAtTop(scrollElement.scrollTop)");
    expect(tray).toContain("releaseTrayContentGesture(touchGesture.state, snaps())");
    expect(tray).toContain("settleReleasedDrag(released, true)");
    expect(tray).not.toContain("startContentMomentum");
    // On sheet takeover, neutralize WebKit's fractional/negative rubber-band
    // offset so the list cannot visually fight the tray's owned geometry.
    expect(tray).toContain("scrollElement.scrollTop = 0");
    expect(appSource).toContain("contentScrollRef={trayScrollRef}");
    expect(declaration(".explore-sheet-scroll")).toContain("touch-action: pan-y");
  });

  test("Option B puts each event's details before its minimap", () => {
    const mapView = appSource.slice(
      appSource.indexOf("function MapView("),
      appSource.indexOf("function MapWithEventCards("),
    );
    expect(mapView.indexOf("<MapEventCard")).toBeLessThan(mapView.indexOf("<EventRowMap"));
    expect(declaration(".map-event-row > .map-event-card")).toContain("border-radius: 15px 15px 0 0");
    expect(declaration(".map-row-stage:not(.is-fullscreen) .map-canvas")).toContain("border-radius: 0 0 18px 18px");
    expect(declaration(".map-event-row.is-selected")).toBe("");
    expect(declaration(".map-event-card.is-selected")).toContain("box-shadow: none");
    expect(mapView).not.toContain('map-event-row ${hasMap ? "has-map" : "has-no-map"} ${selected ? "is-selected" : ""}');
  });

  test("the Option C heart participates in the shared card header layout", () => {
    const eventCard = appSource.slice(
      appSource.indexOf("function EventCard("),
      appSource.indexOf("function PlaceList("),
    );
    expect(eventCard.indexOf('className={`event-image-wrap')).toBeLessThan(eventCard.indexOf('className={`favorite-button'));
    expect(declaration(".explore-card-anchor .favorite-button")).toContain("position: relative");
  });

  test("fullscreen tray dates use the shared compact semantic hierarchy", () => {
    expect(declaration(".explore-card-anchor .event-date-main")).toContain("font-size: var(--type-card-size)");
    expect(declaration(".explore-card-anchor .event-date-main")).toContain("font-weight: 600");
    expect(declaration(".explore-card-anchor .event-date-time")).toContain("font-size: var(--type-control-size)");
    expect(declaration(".explore-card-anchor .additional-dates")).toContain("font-size: var(--type-caption-size)");
    expect(declaration(".explore-card-anchor .additional-dates")).toContain("color: var(--on-dark-muted)");
  });

  test("event-pin priority remains the other explicit stacking mechanism", () => {
    expect(appSource).toContain("zIndexOffset: markerZIndexOffset({");
    expect(appSource).not.toContain("zIndexOffset: userLocationZIndexOffset");
  });
});
