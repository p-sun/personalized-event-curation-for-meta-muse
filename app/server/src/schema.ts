import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const locations = sqliteTable("locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  addressesJson: text("addresses_json").notNull(),
  websiteUrl: text("website_url"),
  lat: real("lat"),
  lng: real("lng"),
});

export const igSources = sqliteTable("ig_sources", {
  username: text("username").primaryKey(),
  userId: text("user_id"),
  profileUrl: text("profile_url").notNull(),
  followerCount: integer("follower_count"),
  verified: integer("verified", { mode: "boolean" }),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  locationId: text("location_id").notNull(),
  title: text("title").notNull(),
  venue: text("venue").notNull(),
  address: text("address").notNull(),
  lat: real("lat"),
  lng: real("lng"),
  category: text("category").notNull(),
  isFree: integer("is_free", { mode: "boolean" }).notNull(),
  priceText: text("price_text").notNull(),
  description: text("description").notNull(),
  officialUrl: text("official_url"),
  sourceUrl: text("source_url").notNull(),
  imageBlobKey: text("image_blob_key"),
  igMentionCount: integer("ig_mention_count").notNull().default(0),
});

export const eventOccurrences = sqliteTable("event_occurrences", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  timesText: text("times_text").notNull(),
});

// Read-only legacy favorites are retained long enough for the client to migrate
// each device to localStorage. New favorite changes never write to the server.
export const eventFavorites = sqliteTable("event_favorites", {
  eventId: text("event_id").primaryKey(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const datasetState = sqliteTable("dataset_state", {
  id: integer("id").primaryKey(),
  eventCount: integer("event_count").notNull(),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }).notNull(),
});

