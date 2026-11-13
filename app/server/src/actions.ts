import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import * as schema from "./schema";
import { ingestEventImage, type ImageIngestDeps } from "./imageIngest";

// Image ingestion dependencies bound to this invocation: outbound fetch plus
// the artifact's owned blob storage. Ingestion keys off the caller-supplied
// REMOTE image_url only — never a resolved `./blobs/` path.
function imageIngestDeps(ctx: Ctx): ImageIngestDeps {
  return {
    fetch: (url, init) => fetch(url, init),
    putBlob: async (key, data, options) => {
      await ctx.blobs.put(key, data, options);
    },
  };
}

const imageWarningOutput = z.object({
  event_id: z.string(),
  image_url: z.string(),
  error: z.string(),
});

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Date must be valid");

const httpsUrl = z.string().url().refine((value) => value.startsWith("https://"), "URL must use HTTPS");

const locationInput = z.object({
  id: z.string().trim().min(1).max(240),
  name: z.string().trim().min(1).max(240),
  addresses: z.array(z.string().trim().min(1).max(400)).min(1).max(50),
  website_url: httpsUrl.nullable(),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
}).superRefine((location, ctx) => {
  if ((location.lat === null) !== (location.lng === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "lat and lng must both be present or both be null", path: ["lat"] });
  }
  const normalized = location.addresses.map((address) => address.toLocaleLowerCase("en-US"));
  if (new Set(normalized).size !== normalized.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "addresses must be unique within a location", path: ["addresses"] });
  }
});

const occurrenceInput = z.object({
  id: z.string().trim().min(1).max(300).optional(),
  start_date: dateString,
  end_date: dateString.nullable(),
  times_text: z.string().trim().min(1).max(240),
}).refine((occurrence) => !occurrence.end_date || occurrence.end_date >= occurrence.start_date, {
  message: "end_date cannot be before start_date",
  path: ["end_date"],
});

const eventInput = z.object({
  id: z.string().trim().min(1).max(240),
  location_id: z.string().trim().min(1).max(240),
  title: z.string().trim().min(1).max(300),
  venue: z.string().trim().min(1).max(240),
  address: z.string().trim().min(1).max(400),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  occurrences: z.array(occurrenceInput).min(1).max(200),
  category: z.string().trim().min(1).max(80),
  is_free: z.boolean(),
  price_text: z.string().trim().max(120),
  description: z.string().trim().min(1).max(1200),
  official_url: httpsUrl.nullable(),
  source_url: httpsUrl,
  image_url: httpsUrl.nullable().optional(),
  ig_mention_count: z.number().int().nonnegative().max(1_000_000).optional().default(0),
}).refine((event) => (event.lat === null) === (event.lng === null), {
  message: "lat and lng must both be present or both be null",
  path: ["lat"],
});

type OccurrenceInput = z.infer<typeof occurrenceInput>;

const updateEventInput = z.object({
  id: z.string().trim().min(1).max(240),
  location_id: z.string().trim().min(1).max(240).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  venue: z.string().trim().min(1).max(240).optional(),
  address: z.string().trim().min(1).max(400).optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  occurrences: z.array(occurrenceInput).min(1).max(200).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  is_free: z.boolean().optional(),
  price_text: z.string().trim().max(120).optional(),
  description: z.string().trim().min(1).max(1200).optional(),
  official_url: httpsUrl.nullable().optional(),
  source_url: httpsUrl.optional(),
  image_url: httpsUrl.nullable().optional(),
  ig_mention_count: z.number().int().nonnegative().max(1_000_000).optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "id"), {
  message: "Provide at least one field to update",
});

// Dataset writes are owner-only: the read actions serve the public feed to
// any viewer (including signed-out guests on a public share), but only the
// owner — in practice the owner's own ingestion pipeline — may replace or
// mutate the stored events, locations, and IG sources. A missing viewer
// (guest) never satisfies this check.
function requireOwner(ctx: { viewer?: { isOwner: boolean } }): void {
  if (ctx.viewer?.isOwner !== true) {
    throw new Error("Owner required: this action changes the stored dataset and is not available to guests or shared viewers.");
  }
}

function occurrenceId(eventId: string, occurrence: OccurrenceInput, index: number): string {
  return occurrence.id ?? `${eventId}::${occurrence.start_date}::${index + 1}`;
}

function normalizeTimesText(value: string): string {
  return value.replace(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[^·]*·\s*/i, "");
}

function parseLocationAddresses(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((address) => typeof address === "string" && address.trim().length > 0)) {
      return parsed;
    }
  } catch {
    // Invalid legacy data renders as an empty list rather than breaking the whole feed.
  }
  return [];
}

const igSourceInput = z.object({
  username: z.string().trim().min(1).max(100),
  user_id: z.string().trim().min(1).max(100).nullable(),
  profile_url: httpsUrl,
  follower_count: z.number().int().nonnegative().max(10_000_000_000).nullable(),
  verified: z.boolean().nullable(),
});

const igSourceOutput = igSourceInput;

const occurrenceOutput = z.object({
  id: z.string(),
  start_date: z.string(),
  end_date: z.string().nullable(),
  times_text: z.string(),
});

const locationOutput = z.object({
  id: z.string(),
  name: z.string(),
  addresses: z.array(z.string()),
  website_url: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
});

const eventOutput = z.object({
  id: z.string(),
  location_id: z.string(),
  title: z.string(),
  venue: z.string(),
  address: z.string(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  occurrences: z.array(occurrenceOutput),
  category: z.string(),
  is_free: z.boolean(),
  price_text: z.string(),
  description: z.string(),
  official_url: z.string().nullable(),
  source_url: z.string(),
  image_url: z.string().nullable(),
  image_cache_key: z.string().nullable(),
  ig_mention_count: z.number().int().nonnegative(),
});

export const Actions = {
  list_ig_sources: defineAction({
    description: "Lists the Instagram source accounts the event pipeline tracks, with profile and follower metadata.",
    request: z.object({}),
    response: z.object({ sources: z.array(igSourceOutput) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.igSources).orderBy(
        sql`lower(${schema.igSources.username})`,
        asc(schema.igSources.username),
      );
      return {
        sources: rows.map((row) => ({
          username: row.username,
          user_id: row.userId,
          profile_url: row.profileUrl,
          follower_count: row.followerCount,
          verified: row.verified,
        })),
      };
    },
  }),

  replace_ig_sources: defineAction({
    description: "Replaces the full Instagram source account list with the supplied set (owner-only dataset sync).",
    request: z.object({ sources: z.array(igSourceInput).max(5000) }),
    response: z.object({ replaced: z.number().int().nonnegative() }),
    async handler(ctx, args) {
      requireOwner(ctx);
      const seenUsernames = new Set<string>();
      for (const source of args.sources) {
        const usernameKey = source.username.toLocaleLowerCase("en-US");
        if (seenUsernames.has(usernameKey)) throw new Error(`Duplicate IG source: ${source.username}`);
        seenUsernames.add(usernameKey);
      }

      const db = ctx.db<typeof schema>();
      const insertStatements = [];
      for (let index = 0; index < args.sources.length; index += 80) {
        const chunk = args.sources.slice(index, index + 80);
        if (chunk.length) insertStatements.push(db.insert(schema.igSources).values(chunk.map((source) => ({
          username: source.username,
          userId: source.user_id,
          profileUrl: source.profile_url,
          followerCount: source.follower_count,
          verified: source.verified,
        }))));
      }
      await db.batch([db.delete(schema.igSources), ...insertStatements]);
      ctx.invalidateQueries();
      return { replaced: args.sources.length };
    },
  }),

  list_locations: defineAction({
    description: "Lists all venue locations with their addresses, website, and coordinates.",
    request: z.object({}),
    response: z.object({ locations: z.array(locationOutput) }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.locations).orderBy(asc(schema.locations.name));
      return {
        locations: rows.map((row) => ({
          id: row.id,
          name: row.name,
          addresses: parseLocationAddresses(row.addressesJson),
          website_url: row.websiteUrl,
          lat: row.lat,
          lng: row.lng,
        })),
      };
    },
  }),

  replace_locations: defineAction({
    description: "Replaces the full locations catalog with the supplied set after validating that every event's location is still present (owner-only dataset sync).",
    request: z.object({ locations: z.array(locationInput).max(5000) }),
    response: z.object({ replaced: z.number().int().nonnegative() }),
    async handler(ctx, args) {
      requireOwner(ctx);
      const seenIds = new Set<string>();
      const seenNames = new Set<string>();
      const addressOwners = new Map<string, string>();
      for (const location of args.locations) {
        if (seenIds.has(location.id)) throw new Error(`Duplicate location id: ${location.id}`);
        seenIds.add(location.id);
        const nameKey = location.name.trim().toLocaleLowerCase("en-US");
        if (seenNames.has(nameKey)) throw new Error(`Duplicate location: ${location.name}`);
        seenNames.add(nameKey);
        for (const address of location.addresses) {
          const addressKey = address.trim().toLocaleLowerCase("en-US");
          const existingOwner = addressOwners.get(addressKey);
          if (existingOwner && existingOwner !== location.id) throw new Error(`Address belongs to more than one location: ${address}`);
          addressOwners.set(addressKey, location.id);
        }
      }

      const db = ctx.db<typeof schema>();
      const referenced = await db.select({ locationId: schema.events.locationId }).from(schema.events);
      const missing = Array.from(new Set(referenced.map((row) => row.locationId))).filter((id) => !seenIds.has(id));
      if (missing.length > 0) throw new Error("Every event location must remain in the locations list. Replace events first or include all referenced locations.");

      const insertStatements = [];
      for (let index = 0; index < args.locations.length; index += 80) {
        const chunk = args.locations.slice(index, index + 80);
        if (chunk.length) insertStatements.push(db.insert(schema.locations).values(chunk.map((location) => ({
          id: location.id,
          name: location.name,
          addressesJson: JSON.stringify(location.addresses),
          websiteUrl: location.website_url,
          lat: location.lat,
          lng: location.lng,
        }))));
      }
      await db.batch([db.delete(schema.locations), ...insertStatements]);
      ctx.invalidateQueries();
      return { replaced: args.locations.length };
    },
  }),

  upsert_location: defineAction({
    description: "Creates or updates a single location record by id, enforcing the same name and address uniqueness rules as the full replace (owner-only dataset sync).",
    request: locationInput,
    response: z.object({ id: z.string(), created: z.boolean() }),
    async handler(ctx, args) {
      requireOwner(ctx);
      const db = ctx.db<typeof schema>();
      // Preserve replace_locations' uniqueness invariants against the live
      // table: names unique across locations (case-insensitive)...
      const nameKey = args.name.trim().toLocaleLowerCase("en-US");
      const rows = await db.select().from(schema.locations);
      const nameOwner = rows.find((row) => row.name.trim().toLocaleLowerCase("en-US") === nameKey);
      if (nameOwner && nameOwner.id !== args.id) {
        throw new Error(`Duplicate location: ${args.name} (already owned by ${nameOwner.id})`);
      }
      // ...and each address owned by at most one location (case-insensitive).
      // Updating a location's own record is allowed, so skip its own row.
      for (const row of rows) {
        if (row.id === args.id) continue;
        const owned = parseLocationAddresses(row.addressesJson).map((address) =>
          address.trim().toLocaleLowerCase("en-US"));
        for (const address of args.addresses) {
          if (owned.includes(address.trim().toLocaleLowerCase("en-US"))) {
            throw new Error(`Address belongs to more than one location: ${address}`);
          }
        }
      }
      const wasCreated = !rows.some((row) => row.id === args.id);
      const values = {
        id: args.id,
        name: args.name,
        addressesJson: JSON.stringify(args.addresses),
        websiteUrl: args.website_url,
        lat: args.lat,
        lng: args.lng,
      };
      await db.insert(schema.locations).values(values).onConflictDoUpdate({
        target: schema.locations.id,
        set: {
          name: values.name,
          addressesJson: values.addressesJson,
          websiteUrl: values.websiteUrl,
          lat: values.lat,
          lng: values.lng,
        },
      });
      ctx.invalidateQueries();
      return { id: args.id, created: wasCreated };
    },
  }),

  list_events: defineAction({
    description: "Lists all events with their occurrences, resolved image URLs, legacy favorite ids, and the last dataset sync time.",
    request: z.object({}),
    response: z.object({ events: z.array(eventOutput), favorite_ids: z.array(z.string()), last_synced_at: z.string().nullable() }),
    async handler(ctx) {
      const db = ctx.db<typeof schema>();
      const [rows, occurrenceRows, stateRows, favoriteRows] = await Promise.all([
        db.select().from(schema.events),
        db.select().from(schema.eventOccurrences).orderBy(asc(schema.eventOccurrences.startDate), asc(schema.eventOccurrences.id)),
        db.select().from(schema.datasetState).limit(1),
        db.select({ eventId: schema.eventFavorites.eventId }).from(schema.eventFavorites),
      ]);
      const hydratedEvents = (await Promise.all(rows.map(async (row) => ({
        id: row.id,
        location_id: row.locationId,
        title: row.title,
        venue: row.venue,
        address: row.address,
        lat: row.lat,
        lng: row.lng,
        occurrences: occurrenceRows.filter((occurrence) => occurrence.eventId === row.id).map((occurrence) => ({
          id: occurrence.id,
          start_date: occurrence.startDate,
          end_date: occurrence.endDate,
          times_text: occurrence.timesText,
        })),
        category: row.category,
        is_free: row.isFree,
        price_text: row.priceText,
        description: row.description,
        official_url: row.officialUrl,
        source_url: row.sourceUrl,
        image_url: row.imageBlobKey ? await ctx.blobs.getUrl(row.imageBlobKey) : null,
        image_cache_key: row.imageBlobKey,
        ig_mention_count: row.igMentionCount,
      })))).filter((event) => event.occurrences.length > 0);
      hydratedEvents.sort((a, b) => {
        const aDate = a.occurrences[0]?.start_date ?? "9999-12-31";
        const bDate = b.occurrences[0]?.start_date ?? "9999-12-31";
        return aDate.localeCompare(bDate) || a.title.localeCompare(b.title);
      });
      return {
        events: hydratedEvents,
        favorite_ids: favoriteRows.map((row) => row.eventId),
        last_synced_at: stateRows[0]?.lastSyncedAt.toISOString() ?? null,
      };
    },
  }),

  update_event: defineAction({
    description: "Updates fields on a single stored event, optionally replacing its occurrences; a supplied remote image_url is fetched into owned blob storage when the event has no blob yet (owner-only).",
    request: updateEventInput,
    response: z.object({
      id: z.string(),
      updated: z.boolean(),
      image_status: z.string(),
      image_error: z.string().nullable(),
    }),
    async handler(ctx, args) {
      requireOwner(ctx);
      const db = ctx.db<typeof schema>();
      const current = (await db.select().from(schema.events).where(eq(schema.events.id, args.id)).limit(1))[0];
      if (!current) return { id: args.id, updated: false, image_status: "not-applied", image_error: null };
      if (args.location_id) {
        const location = await db.select({ id: schema.locations.id }).from(schema.locations).where(eq(schema.locations.id, args.location_id)).limit(1);
        if (location.length === 0) throw new Error("The selected location does not exist. Replace locations before assigning it to an event.");
      }
      const lat = args.lat === undefined ? current.lat : args.lat;
      const lng = args.lng === undefined ? current.lng : args.lng;
      if ((lat === null) !== (lng === null)) throw new Error("lat and lng must both be present or both be null");
      // Image handling (see imageIngest.ts): an omitted image_url preserves
      // any existing owned blob; an explicit null clears it; a supplied
      // remote URL is fetched into blob storage when no blob exists yet. A
      // fetch failure never fails the update — the event persists imageless
      // and the failure is surfaced via image_status / image_error.
      const imageResult = await ingestEventImage(imageIngestDeps(ctx), {
        eventId: args.id,
        suppliedUrl: args.image_url,
        existingKey: current.imageBlobKey,
      });
      const imageBlobKey = imageResult.blobKey;

      await db.update(schema.events).set({
        locationId: args.location_id ?? current.locationId,
        title: args.title ?? current.title,
        venue: args.venue ?? current.venue,
        address: args.address ?? current.address,
        lat,
        lng,
        category: args.category ?? current.category,
        isFree: args.is_free ?? current.isFree,
        priceText: args.price_text ?? current.priceText,
        description: args.description ?? current.description,
        officialUrl: args.official_url === undefined ? current.officialUrl : args.official_url,
        sourceUrl: args.source_url ?? current.sourceUrl,
        imageBlobKey,
        igMentionCount: args.ig_mention_count ?? current.igMentionCount,
      }).where(eq(schema.events.id, args.id));
      if (args.occurrences) {
        const ids = new Set<string>();
        const values = args.occurrences.map((occurrence, index) => {
          const id = occurrenceId(args.id, occurrence, index);
          if (ids.has(id)) throw new Error("Occurrence ids must be unique within an event");
          ids.add(id);
          return { id, eventId: args.id, startDate: occurrence.start_date, endDate: occurrence.end_date, timesText: normalizeTimesText(occurrence.times_text) };
        });
        await db.batch([
          db.delete(schema.eventOccurrences).where(eq(schema.eventOccurrences.eventId, args.id)),
          db.insert(schema.eventOccurrences).values(values),
        ]);
      }
      ctx.invalidateQueries();
      return {
        id: args.id,
        updated: true,
        image_status: imageResult.status,
        image_error: imageResult.error ?? null,
      };
    },
  }),

  delete_event: defineAction({
    description: "Deletes a single event together with its occurrences and favorite rows (owner-only).",
    request: z.object({ id: z.string().trim().min(1).max(240) }),
    response: z.object({ id: z.string(), deleted: z.boolean() }),
    async handler(ctx, args) {
      requireOwner(ctx);
      const db = ctx.db<typeof schema>();
      const rows = await db.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.id, args.id)).limit(1);
      if (rows.length === 0) return { id: args.id, deleted: false };
      const stateRows = await db.select().from(schema.datasetState).limit(1);
      const nextCount = Math.max(0, (stateRows[0]?.eventCount ?? 1) - 1);
      await db.batch([
        db.delete(schema.eventOccurrences).where(eq(schema.eventOccurrences.eventId, args.id)),
        db.delete(schema.eventFavorites).where(eq(schema.eventFavorites.eventId, args.id)),
        db.delete(schema.events).where(eq(schema.events.id, args.id)),
        db.insert(schema.datasetState).values({ id: 1, eventCount: nextCount, lastSyncedAt: new Date() }).onConflictDoUpdate({
          target: schema.datasetState.id,
          set: { eventCount: nextCount, lastSyncedAt: new Date() },
        }),
      ]);
      ctx.invalidateQueries();
      return { id: args.id, deleted: true };
    },
  }),

  delete_events_ended_on_or_before: defineAction({
    description: "Deletes every event whose last occurrence ended on or before the given date, together with its occurrences and favorite rows (owner-only).",
    request: z.object({ cutoff_date: dateString }),
    response: z.object({
      deleted_events: z.number().int().nonnegative(),
      deleted_occurrences: z.number().int().nonnegative(),
      remaining_events: z.number().int().nonnegative(),
    }),
    async handler(ctx, args) {
      requireOwner(ctx);
      const db = ctx.db<typeof schema>();
      const [allEventRows, occurrenceRows] = await Promise.all([
        db.select({ id: schema.events.id }).from(schema.events),
        db.select({
          eventId: schema.eventOccurrences.eventId,
          startDate: schema.eventOccurrences.startDate,
          endDate: schema.eventOccurrences.endDate,
        }).from(schema.eventOccurrences),
      ]);
      const lastEndByEvent = new Map<string, string>();
      const occurrenceCountByEvent = new Map<string, number>();
      for (const row of occurrenceRows) {
        const end = row.endDate ?? row.startDate;
        const current = lastEndByEvent.get(row.eventId);
        if (current === undefined || end > current) lastEndByEvent.set(row.eventId, end);
        occurrenceCountByEvent.set(row.eventId, (occurrenceCountByEvent.get(row.eventId) ?? 0) + 1);
      }
      // An event counts as ended on the end of its final occurrence; events
      // with no occurrences have no end date and are never pruned here.
      const doomedIds = Array.from(lastEndByEvent.entries())
        .filter(([, lastEnd]) => lastEnd <= args.cutoff_date)
        .map(([eventId]) => eventId);
      const remainingCount = allEventRows.length - doomedIds.length;
      if (doomedIds.length === 0) {
        return { deleted_events: 0, deleted_occurrences: 0, remaining_events: remainingCount };
      }
      const deletedOccurrences = doomedIds.reduce(
        (sum, id) => sum + (occurrenceCountByEvent.get(id) ?? 0),
        0,
      );
      const syncedAt = new Date();
      const statements: BatchItem<"sqlite">[] = [
        db.delete(schema.eventOccurrences).where(inArray(schema.eventOccurrences.eventId, doomedIds)),
        db.delete(schema.eventFavorites).where(inArray(schema.eventFavorites.eventId, doomedIds)),
        db.delete(schema.events).where(inArray(schema.events.id, doomedIds)),
        db.insert(schema.datasetState).values({ id: 1, eventCount: remainingCount, lastSyncedAt: syncedAt }).onConflictDoUpdate({
          target: schema.datasetState.id,
          set: { eventCount: remainingCount, lastSyncedAt: syncedAt },
        }),
      ];
      const [first, ...rest] = statements;
      if (first) await db.batch([first, ...rest]);
      ctx.invalidateQueries();
      return {
        deleted_events: doomedIds.length,
        deleted_occurrences: deletedOccurrences,
        remaining_events: remainingCount,
      };
    },
  }),

  set_ig_mention_counts: defineAction({
    description: "Sets the Instagram mention count for each supplied event id (owner-only pipeline sync).",
    request: z.object({
      counts: z.array(z.object({
        event_id: z.string().trim().min(1).max(240),
        count: z.number().int().nonnegative().max(1_000_000),
      })).max(5000),
    }),
    response: z.object({ updated: z.number().int().nonnegative() }),
    async handler(ctx, args) {
      requireOwner(ctx);
      const seenIds = new Set<string>();
      for (const item of args.counts) {
        if (seenIds.has(item.event_id)) throw new Error(`Duplicate event id: ${item.event_id}`);
        seenIds.add(item.event_id);
      }
      if (args.counts.length === 0) return { updated: 0 };
      const db = ctx.db<typeof schema>();
      const updateCount = (item: (typeof args.counts)[number]) => (
        db.update(schema.events)
          .set({ igMentionCount: item.count })
          .where(eq(schema.events.id, item.event_id))
      );
      const [first, ...rest] = args.counts;
      await db.batch([updateCount(first!), ...rest.map(updateCount)]);
      ctx.invalidateQueries();
      return { updated: args.counts.length };
    },
  }),

  replace_events: defineAction({
    description: "Inserts or updates the supplied events and their occurrences; events omitted from the batch are retained. Supplied remote image URLs are fetched into owned blob storage for events without a blob; failures are reported in image_warnings without failing the sync (owner-only pipeline sync).",
    request: z.object({ events: z.array(eventInput).max(5000) }),
    response: z.object({
      replaced: z.number().int().nonnegative(),
      synced_at: z.string(),
      images_ingested: z.number().int().nonnegative(),
      image_warnings: z.array(imageWarningOutput),
    }),
    async handler(ctx, args) {
      requireOwner(ctx);
      const seenIds = new Set<string>();
      const seenLogical = new Set<string>();
      for (const event of args.events) {
        if (seenIds.has(event.id)) throw new Error(`Duplicate event id: ${event.id}`);
        seenIds.add(event.id);
        const logicalKey = [event.title, event.venue, event.source_url].map((value) => value.trim().toLocaleLowerCase("en-US")).join("|");
        if (seenLogical.has(logicalKey)) throw new Error(`Recurring dates must be combined into one event: ${event.title}`);
        seenLogical.add(logicalKey);
      }

      const db = ctx.db<typeof schema>();
      const requestedLocationIds = Array.from(new Set(args.events.map((event) => event.location_id)));
      if (requestedLocationIds.length > 0) {
        const locationRows = await db.select({ id: schema.locations.id }).from(schema.locations).where(inArray(schema.locations.id, requestedLocationIds));
        const locationIds = new Set(locationRows.map((row) => row.id));
        const missingLocation = requestedLocationIds.find((id) => !locationIds.has(id));
        if (missingLocation) throw new Error(`Unknown location id: ${missingLocation}. Replace locations before events.`);
      }
      const currentRows = await db.select({ id: schema.events.id, imageBlobKey: schema.events.imageBlobKey }).from(schema.events);
      const currentImages = new Map(currentRows.map((row) => [row.id, row.imageBlobKey]));
      const syncedAt = new Date();
      // Image handling (see imageIngest.ts): an omitted image_url preserves
      // the owned blob (the pipeline's protective path); an explicit null
      // clears it; a supplied remote URL is fetched into blob storage when
      // the event owns no blob yet. Fetches run concurrently and a failure
      // never fails the sync — the event persists imageless and the failure
      // is reported in image_warnings.
      const deps = imageIngestDeps(ctx);
      const imageResults = await Promise.all(args.events.map(async (event) => ({
        event,
        result: await ingestEventImage(deps, {
          eventId: event.id,
          suppliedUrl: event.image_url,
          existingKey: currentImages.get(event.id) ?? null,
        }),
      })));
      const imageKeys = new Map(imageResults.map(({ event, result }) => [event.id, result.blobKey]));
      const imagesIngested = imageResults.filter(({ result }) => result.status === "ingested").length;
      const imageWarnings = imageResults
        .filter(({ result }) => result.status === "failed")
        .map(({ event, result }) => ({
          event_id: event.id,
          image_url: event.image_url ?? "",
          error: result.error ?? "Image ingestion failed",
        }));

      const eventStatements = [];
      for (let index = 0; index < args.events.length; index += 40) {
        const chunk = args.events.slice(index, index + 40);
        if (chunk.length) eventStatements.push(db.insert(schema.events).values(chunk.map((event) => ({
          id: event.id,
          locationId: event.location_id,
          title: event.title,
          venue: event.venue,
          address: event.address,
          lat: event.lat,
          lng: event.lng,
          category: event.category,
          isFree: event.is_free,
          priceText: event.price_text,
          description: event.description,
          officialUrl: event.official_url,
          sourceUrl: event.source_url,
          imageBlobKey: imageKeys.get(event.id) ?? null,
          igMentionCount: event.ig_mention_count,
        }))).onConflictDoUpdate({
          target: schema.events.id,
          set: {
            locationId: sql`excluded.location_id`,
            title: sql`excluded.title`,
            venue: sql`excluded.venue`,
            address: sql`excluded.address`,
            lat: sql`excluded.lat`,
            lng: sql`excluded.lng`,
            category: sql`excluded.category`,
            isFree: sql`excluded.is_free`,
            priceText: sql`excluded.price_text`,
            description: sql`excluded.description`,
            officialUrl: sql`excluded.official_url`,
            sourceUrl: sql`excluded.source_url`,
            imageBlobKey: sql`excluded.image_blob_key`,
            igMentionCount: sql`excluded.ig_mention_count`,
          },
        }));
      }
      const occurrenceValues = args.events.flatMap((event) => event.occurrences.map((occurrence, index) => ({
        id: occurrenceId(event.id, occurrence, index),
        eventId: event.id,
        startDate: occurrence.start_date,
        endDate: occurrence.end_date,
        timesText: normalizeTimesText(occurrence.times_text),
      })));
      const occurrenceIds = new Set<string>();
      for (const occurrence of occurrenceValues) {
        if (occurrenceIds.has(occurrence.id)) throw new Error(`Duplicate occurrence id: ${occurrence.id}`);
        occurrenceIds.add(occurrence.id);
      }
      const occurrenceStatements = [];
      for (let index = 0; index < occurrenceValues.length; index += 80) {
        const chunk = occurrenceValues.slice(index, index + 80);
        if (chunk.length) occurrenceStatements.push(db.insert(schema.eventOccurrences).values(chunk));
      }

      // This action intentionally performs a non-destructive sync. Each supplied
      // event is inserted or updated by id; events omitted from a small batch are
      // retained. Removal is always explicit through delete_event.
      if (args.events.length > 0) {
        await db.batch([
          db.delete(schema.eventOccurrences).where(inArray(schema.eventOccurrences.eventId, Array.from(seenIds))),
          ...eventStatements,
          ...occurrenceStatements,
        ]);
      }
      const allEventRows = await db.select({ id: schema.events.id }).from(schema.events);
      await db.insert(schema.datasetState).values({ id: 1, eventCount: allEventRows.length, lastSyncedAt: syncedAt }).onConflictDoUpdate({
        target: schema.datasetState.id,
        set: { eventCount: allEventRows.length, lastSyncedAt: syncedAt },
      });
      ctx.invalidateQueries();
      return {
        replaced: args.events.length,
        synced_at: syncedAt.toISOString(),
        images_ingested: imagesIngested,
        image_warnings: imageWarnings,
      };
    },
  }),
} satisfies ActionsModule;
