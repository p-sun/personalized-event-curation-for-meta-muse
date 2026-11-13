import { APP_BUILD_MODE } from "./buildMode";

export type EventImageMode = "blob" | "static-assets";

/**
 * Build-time image transport for the shared event UI.
 *
 * The fullstack artifact keeps blob URLs returned by list_events. The manual
 * static build changes APP_BUILD_MODE to "static", which makes event images
 * resolve only through the generated baked-asset manifest.
 */
export const EVENT_IMAGE_MODE: EventImageMode = APP_BUILD_MODE === "static"
  ? "static-assets"
  : "blob";
