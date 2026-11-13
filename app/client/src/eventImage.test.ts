import { describe, expect, test } from "bun:test";
import { resolveEventImageSrc, type EventImageEvent } from "./EventImage";
import { EVENT_IMAGE_MANIFEST } from "./generated/imageManifest";

const event: EventImageEvent = {
  id: "event-with-photo",
  title: "Event with photo",
  image_url: "https://blob.example/event-with-photo.jpg",
};

describe("event image source resolution", () => {
  test("blob mode preserves the server-provided image URL", () => {
    expect(resolveEventImageSrc(event, "blob", {})).toBe(event.image_url);
  });

  test("static-assets mode resolves by event id instead of trusting image_url", () => {
    expect(resolveEventImageSrc(event, "static-assets", {
      "event-with-photo": "/assets/event-with-photo.a1b2.jpg",
    })).toBe("/assets/event-with-photo.a1b2.jpg");
  });

  test("static-assets mode uses the abstract placeholder when the bake missed an image", () => {
    expect(resolveEventImageSrc(event, "static-assets", {})).toBeNull();
  });

  test("an event without image_url uses the abstract placeholder in every mode", () => {
    const imageless = { ...event, image_url: null };
    expect(resolveEventImageSrc(imageless, "blob", {})).toBeNull();
    expect(resolveEventImageSrc(imageless, "static-assets", {
      "event-with-photo": "/assets/stale.jpg",
    })).toBeNull();
  });

  test("the fullstack build intentionally ships an empty static manifest", () => {
    expect(EVENT_IMAGE_MANIFEST).toEqual({});
  });
});
