import { describe, expect, test } from "bun:test";
import {
  coverBlobKey,
  ingestEventImage,
  isRemoteImageUrl,
  sha256Hex,
  type ImageIngestDeps,
} from "../../server/src/imageIngest";

// Minimal JPEG-ish bytes; the ingestion path validates the response
// content-type, not the payload, so the exact image encoding is irrelevant.
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5]);

function fakeDeps(overrides: Partial<ImageIngestDeps> = {}): {
  deps: ImageIngestDeps;
  puts: { key: string; data: ArrayBuffer; contentType: string }[];
  fetches: string[];
} {
  const puts: { key: string; data: ArrayBuffer; contentType: string }[] = [];
  const fetches: string[] = [];
  const deps: ImageIngestDeps = {
    fetch: async (url) => {
      fetches.push(url);
      return new Response(JPEG_BYTES, {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      });
    },
    putBlob: async (key, data, options) => {
      puts.push({ key, data, contentType: options.contentType });
    },
    ...overrides,
  };
  return { deps, puts, fetches };
}

describe("remote image URL detection", () => {
  test("accepts remote http(s) URLs", () => {
    expect(isRemoteImageUrl("https://bryantpark.org/images/meta/photo.jpg")).toBe(true);
    expect(isRemoteImageUrl("http://example.com/photo.png")).toBe(true);
  });

  test("rejects resolved blob paths — ingestion keys off the remote URL only", () => {
    expect(isRemoteImageUrl("./blobs/ZXZlbnRzL2V2ZW50")).toBe(false);
    expect(isRemoteImageUrl("/blobs/ZXZlbnRzL2V2ZW50")).toBe(false);
    expect(isRemoteImageUrl("https://example.com/blobs/ZXZlbnRzL2V2ZW50")).toBe(false);
  });

  test("rejects non-URLs and non-http schemes", () => {
    expect(isRemoteImageUrl("not a url")).toBe(false);
    expect(isRemoteImageUrl("ftp://example.com/photo.jpg")).toBe(false);
  });
});

describe("cover blob key convention", () => {
  test("matches events/<event-id>/cover-<24 hex chars>", () => {
    expect(coverBlobKey("my-event", "abcdef0123456789abcdef0123456789"))
      .toBe("events/my-event/cover-abcdef0123456789abcdef01");
  });
});

describe("ingestEventImage", () => {
  test("mints a key when a remote URL is supplied and no blob exists", async () => {
    const { deps, puts, fetches } = fakeDeps();
    const result = await ingestEventImage(deps, {
      eventId: "bryant-park-winter-village",
      suppliedUrl: "https://bryantpark.org/images/meta/WinterVillage.jpg",
      existingKey: null,
    });
    const expectedKey = coverBlobKey(
      "bryant-park-winter-village",
      await sha256Hex(JPEG_BYTES.buffer as ArrayBuffer),
    );
    expect(result.status).toBe("ingested");
    expect(result.blobKey).toBe(expectedKey);
    expect(result.blobKey).toMatch(
      /^events\/bryant-park-winter-village\/cover-[0-9a-f]{24}$/,
    );
    expect(fetches).toEqual(["https://bryantpark.org/images/meta/WinterVillage.jpg"]);
    expect(puts).toHaveLength(1);
    expect(puts[0]?.key).toBe(expectedKey);
    expect(puts[0]?.contentType).toBe("image/jpeg");
    expect(puts[0]?.data.byteLength).toBe(JPEG_BYTES.byteLength);
  });

  test("omitted image_url preserves an existing blob without fetching", async () => {
    const existing = "events/old-event/cover-0123456789abcdef01234567";
    const { deps, puts, fetches } = fakeDeps({
      fetch: async () => {
        throw new Error("fetch must not be called when image_url is omitted");
      },
    });
    const result = await ingestEventImage(deps, {
      eventId: "old-event",
      suppliedUrl: undefined,
      existingKey: existing,
    });
    expect(result.status).toBe("preserved");
    expect(result.blobKey).toBe(existing);
    expect(fetches).toHaveLength(0);
    expect(puts).toHaveLength(0);
  });

  test("omitted image_url on an imageless event stays imageless without fetching", async () => {
    const { deps, fetches } = fakeDeps();
    const result = await ingestEventImage(deps, {
      eventId: "new-event",
      suppliedUrl: undefined,
      existingKey: null,
    });
    expect(result.status).toBe("preserved");
    expect(result.blobKey).toBeNull();
    expect(fetches).toHaveLength(0);
  });

  test("explicit null clears the image without fetching", async () => {
    const { deps, fetches } = fakeDeps();
    const result = await ingestEventImage(deps, {
      eventId: "old-event",
      suppliedUrl: null,
      existingKey: "events/old-event/cover-0123456789abcdef01234567",
    });
    expect(result.status).toBe("cleared");
    expect(result.blobKey).toBeNull();
    expect(fetches).toHaveLength(0);
  });

  test("a supplied URL on an event that already owns a blob keeps that blob", async () => {
    const existing = "events/old-event/cover-0123456789abcdef01234567";
    const { deps, puts, fetches } = fakeDeps();
    const result = await ingestEventImage(deps, {
      eventId: "old-event",
      suppliedUrl: "https://example.com/different.jpg",
      existingKey: existing,
    });
    expect(result.status).toBe("already-owned");
    expect(result.blobKey).toBe(existing);
    expect(fetches).toHaveLength(0);
    expect(puts).toHaveLength(0);
  });

  test("fetch failure leaves the event imageless and surfaces the failure", async () => {
    const { deps, puts } = fakeDeps({
      fetch: async () => {
        throw new Error("network unreachable");
      },
    });
    const result = await ingestEventImage(deps, {
      eventId: "new-event",
      suppliedUrl: "https://example.com/gone.jpg",
      existingKey: null,
    });
    // The action persists the event with this blob key (null = imageless)
    // and reports status/error instead of silently claiming success.
    expect(result.status).toBe("failed");
    expect(result.blobKey).toBeNull();
    expect(result.error).toContain("network unreachable");
    expect(result.error).toContain("https://example.com/gone.jpg");
    expect(puts).toHaveLength(0);
  });

  test("an HTTP error response is a surfaced failure, not a stored blob", async () => {
    const { deps, puts } = fakeDeps({
      fetch: async () =>
        new Response("missing", { status: 404, headers: { "content-type": "image/jpeg" } }),
    });
    const result = await ingestEventImage(deps, {
      eventId: "new-event",
      suppliedUrl: "https://example.com/missing.jpg",
      existingKey: null,
    });
    expect(result.status).toBe("failed");
    expect(result.blobKey).toBeNull();
    expect(result.error).toContain("HTTP 404");
    expect(puts).toHaveLength(0);
  });

  test("a non-image response is a surfaced failure, not a stored blob", async () => {
    const { deps, puts } = fakeDeps({
      fetch: async () =>
        new Response("<html>not an image</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    });
    const result = await ingestEventImage(deps, {
      eventId: "new-event",
      suppliedUrl: "https://example.com/page",
      existingKey: null,
    });
    expect(result.status).toBe("failed");
    expect(result.blobKey).toBeNull();
    expect(result.error).toContain("not an image");
    expect(puts).toHaveLength(0);
  });

  test("a resolved blob path is never fetched as an image source", async () => {
    const { deps, fetches } = fakeDeps();
    const result = await ingestEventImage(deps, {
      eventId: "new-event",
      suppliedUrl: "https://example.com/blobs/ZXZlbnRzL2V2ZW50",
      existingKey: null,
    });
    expect(result.status).toBe("failed");
    expect(result.blobKey).toBeNull();
    expect(result.error).toContain("not a remote http(s) URL");
    expect(fetches).toHaveLength(0);
  });
});
