/**
 * Server-side event image ingestion.
 *
 * The write actions (replace_events, update_event) accept a caller-supplied
 * remote `image_url`. When one is supplied and the stored event does not
 * already own a blob, the image is fetched here, validated, and stored as an
 * owned blob under the existing convention:
 *
 *     events/<event-id>/cover-<first 24 hex chars of the SHA-256 of the bytes>
 *
 * which matches the keys minted for the originally ingested events.
 * `list_events` then resolves that key to a blob URL exactly like the
 * pre-existing ones.
 *
 * Protective behaviors the pipeline relies on:
 * - A write that OMITS `image_url` (undefined) preserves any existing owned
 *   blob untouched. The pipeline omits image fields from pushes precisely to
 *   protect the working photos, so omission must never fetch or clear.
 * - An explicit `image_url: null` clears the image (blob key set to null).
 * - A supplied remote URL on an event that already owns a blob is not
 *   re-fetched: the stored blob is kept ("already-owned").
 * - Ingestion keys off the caller-supplied REMOTE http(s) URL only. Resolved
 *   blob paths (`./blobs/...`, `/blobs/...`) are never treated as remote
 *   sources.
 *
 * A fetch/validation failure never throws: the caller persists the event
 * imageless and surfaces the failure in its response, so a bad image URL can
 * neither fail the event write nor silently pretend success.
 */

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
export const IMAGE_FETCH_TIMEOUT_MS = 15_000;

export type ImageIngestStatus =
  | "preserved"
  | "cleared"
  | "already-owned"
  | "ingested"
  | "failed";

export interface ImageIngestResult {
  status: ImageIngestStatus;
  /** The blob key the event row should store after the write. */
  blobKey: string | null;
  /** Present only when status is "failed". */
  error?: string;
}

export interface ImageIngestDeps {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  putBlob: (
    key: string,
    data: ArrayBuffer,
    options: { contentType: string },
  ) => Promise<void>;
}

/**
 * True only for a remote http(s) URL that can be fetched as an image source.
 * Resolved blob paths are rejected: `./blobs/...` is not a URL at all, and a
 * `/blobs/` path on any host is this platform's blob serving path, not a
 * remote origin.
 */
export function isRemoteImageUrl(value: string): boolean {
  if (!value.startsWith("https://") && !value.startsWith("http://")) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  if (parsed.pathname === "/blobs" || parsed.pathname.startsWith("/blobs/")) return false;
  return true;
}

/** Blob key for an event cover image, matching the existing convention. */
export function coverBlobKey(eventId: string, contentHashHex: string): string {
  return `events/${eventId}/cover-${contentHashHex.slice(0, 24).toLowerCase()}`;
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Resolve the blob key for one event write, fetching and storing the image
 * when required. Never throws for fetch/validation problems; those come back
 * as `{ status: "failed", error }` with the blob key the row should keep
 * (the existing key, or null when there was none).
 */
export async function ingestEventImage(
  deps: ImageIngestDeps,
  args: {
    eventId: string;
    suppliedUrl: string | null | undefined;
    existingKey: string | null;
  },
): Promise<ImageIngestResult> {
  const { eventId, suppliedUrl, existingKey } = args;

  // Omitted image_url: preserve whatever the event already owns. This is the
  // pipeline's protective path and must not fetch or clear anything.
  if (suppliedUrl === undefined) {
    return { status: "preserved", blobKey: existingKey };
  }
  // Explicit null: the documented clearing behavior.
  if (suppliedUrl === null) {
    return { status: "cleared", blobKey: null };
  }
  if (!isRemoteImageUrl(suppliedUrl)) {
    return {
      status: "failed",
      blobKey: existingKey,
      error: `image_url is not a remote http(s) URL; ingestion skipped: ${suppliedUrl}`,
    };
  }
  // The stored row already owns a blob; keep it rather than re-fetching.
  if (existingKey) {
    return { status: "already-owned", blobKey: existingKey };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await deps.fetch(suppliedUrl, {
      signal: controller.signal,
      headers: { accept: "image/*" },
    });
    if (!response.ok) {
      return {
        status: "failed",
        blobKey: null,
        error: `Image fetch failed: HTTP ${response.status} for ${suppliedUrl}`,
      };
    }
    const contentType = (response.headers.get("content-type") ?? "")
      .split(";")[0]
      ?.trim()
      .toLowerCase() ?? "";
    if (!contentType.startsWith("image/")) {
      return {
        status: "failed",
        blobKey: null,
        error: `Image fetch failed: response for ${suppliedUrl} is not an image (content-type: ${contentType || "missing"})`,
      };
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0) {
      return {
        status: "failed",
        blobKey: null,
        error: `Image fetch failed: empty response body for ${suppliedUrl}`,
      };
    }
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return {
        status: "failed",
        blobKey: null,
        error: `Image fetch failed: ${bytes.byteLength} bytes exceeds the ${MAX_IMAGE_BYTES}-byte limit for ${suppliedUrl}`,
      };
    }
    const blobKey = coverBlobKey(eventId, await sha256Hex(bytes));
    await deps.putBlob(blobKey, bytes, { contentType });
    return { status: "ingested", blobKey };
  } catch (error) {
    return {
      status: "failed",
      blobKey: null,
      error: `Image fetch failed for ${suppliedUrl}: ${errorMessage(error)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
