import { describe, expect, test } from "bun:test";
import { googleMapsDirectionsUrl } from "./googleMaps";

describe("googleMapsDirectionsUrl", () => {
  test("builds an HTTPS Google Maps directions link from the current location", () => {
    const href = googleMapsDirectionsUrl("Bryant Park, 41 W 40th St, New York, NY 10018");

    expect(href).not.toBeNull();
    const url = new URL(href!);
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe("www.google.com");
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("destination")).toBe("Bryant Park, 41 W 40th St, New York, NY 10018");
    expect(url.searchParams.get("travelmode")).toBe("walking");
    expect(url.searchParams.has("origin")).toBe(false);
  });

  test("does not emit a link without a destination", () => {
    expect(googleMapsDirectionsUrl("   ")).toBeNull();
  });
});
