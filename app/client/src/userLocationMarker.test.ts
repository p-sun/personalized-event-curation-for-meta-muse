import { describe, expect, test } from "bun:test";

const appSource = await Bun.file(new URL("./App.tsx", import.meta.url)).text();

describe("current-location marker lifecycle", () => {
  test("uses Leaflet's marker lifecycle so animated zooms cannot leave the dot behind", () => {
    expect(appSource).toContain("userMarker.current = L.marker([position.lat, position.lng]");
    expect(appSource).toContain("userMarker.current.setLatLng([position.lat, position.lng])");
    expect(appSource).not.toContain("map.latLngToLayerPoint([position.lat, position.lng])");
    expect(appSource).not.toContain('map.on("move zoom viewreset", updateMarkerPosition)');
  });

  test("keeps the location marker non-interactive and anchored at its center", () => {
    expect(appSource).toContain('className: "user-location-marker-shell"');
    expect(appSource).toContain("iconAnchor: [15, 15]");
    expect(appSource).toContain("interactive: false");
  });

  test("puts the location dot in a dedicated pane above every event marker", () => {
    const locationMarkerBlock = appSource.slice(
      appSource.indexOf("userMarker.current = L.marker([position.lat, position.lng]"),
      appSource.indexOf("}).addTo(map);", appSource.indexOf("userMarker.current = L.marker([position.lat, position.lng]")),
    );
    expect(appSource).toContain("const userLocationPane = map.createPane(USER_LOCATION_PANE)");
    expect(appSource).toContain("userLocationPane.style.zIndex = String(USER_LOCATION_PANE_Z_INDEX)");
    expect(appSource).toContain('userLocationPane.style.pointerEvents = "none"');
    expect(locationMarkerBlock).toContain("pane: USER_LOCATION_PANE");
    expect(locationMarkerBlock).not.toContain("zIndexOffset");
  });

  test("offers a shared locate control only while no location is cached", () => {
    const controls = appSource.slice(
      appSource.indexOf('className="map-floating-controls"'),
      appSource.indexOf("{mapFailed &&", appSource.indexOf('className="map-floating-controls"')),
    );
    expect(controls).toContain('!userLocation.position && !mapControlIsBlocked(controlsConfig, "locate")');
    expect(controls).toContain('aria-label={userLocation.status === "error"');
    expect(controls).toContain(' : "Locate me"}');
    expect(controls).toContain("onClick={requestAndFrameUserLocation}");
    expect(controls).toContain('disabled={userLocation.status === "locating"}');
    expect(controls.indexOf('map-fullscreen-toggle')).toBeLessThan(controls.indexOf('map-locate-toggle'));
    expect(appSource).toContain("frameUserLocationOnReady.current = true");
    expect(appSource).toContain('frameMap({ kind: "point", anchor: userLocation.position, zoom: SELECTED_PIN_ZOOM }, true)');
    expect(appSource).not.toContain("locationMapConsentGranted");
    expect(appSource).not.toContain("Use current location with OpenStreetMap");
  });
});
