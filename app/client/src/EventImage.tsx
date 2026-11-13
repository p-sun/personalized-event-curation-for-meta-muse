import { EVENT_IMAGE_MANIFEST } from "./generated/imageManifest";
import { EVENT_IMAGE_MODE, type EventImageMode } from "./imageConfig";

export type EventImageEvent = {
  id: string;
  title: string;
  image_url: string | null;
};

type EventImageManifest = Readonly<Record<string, string>>;
type PlaceholderVariant = "event-card" | "map-card";

export function resolveEventImageSrc(
  event: EventImageEvent,
  mode: EventImageMode = EVENT_IMAGE_MODE,
  manifest: EventImageManifest = EVENT_IMAGE_MANIFEST,
): string | null {
  if (!event.image_url) return null;
  if (mode === "static-assets") return manifest[event.id] ?? null;
  return event.image_url;
}

export function hasEventImage(event: EventImageEvent): boolean {
  return resolveEventImageSrc(event) !== null;
}

export function EventImage({
  event,
  className,
  eager = false,
  placeholderVariant = "event-card",
}: {
  event: EventImageEvent;
  className: string;
  eager?: boolean;
  placeholderVariant?: PlaceholderVariant;
}) {
  const src = resolveEventImageSrc(event);
  if (src) {
    if (EVENT_IMAGE_MODE === "static-assets") {
      // Static-assets mode must not pass the baked asset URL through React's
      // src prop: the runtime's tunnel attribute path intercepts it, installs
      // a 1x1 transparent GIF, and only swaps in the real image after an async
      // tunnel fetch that never completes in the public serving host. Assign
      // the URL through a ref with a computed-property write instead — the
      // native setter loads the baked file directly, and the build's AST
      // rewriter leaves computed assignments untouched.
      return (
        <img
          className={className}
          ref={(el) => {
            if (el && el.getAttribute("src") !== src) el["src"] = src;
          }}
          alt={`${event.title} event`}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          fetchPriority={eager ? "high" : "auto"}
        />
      );
    }
    return (
      <img
        className={className}
        src={src}
        alt={`${event.title} event`}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={eager ? "high" : "auto"}
      />
    );
  }

  if (placeholderVariant === "map-card") {
    return (
      <div className="map-event-placeholder" role="img" aria-label={`Abstract artwork for ${event.title}`}>
        <span aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="event-image-placeholder" role="img" aria-label={`Abstract artwork for ${event.title}`}>
      <span className="placeholder-texture" aria-hidden="true" />
      <span className="placeholder-orb" aria-hidden="true" />
      <span className="placeholder-ribbon" aria-hidden="true" />
    </div>
  );
}
