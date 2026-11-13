CREATE TABLE events_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  venue TEXT NOT NULL,
  address TEXT NOT NULL,
  lat REAL,
  lng REAL,
  category TEXT NOT NULL,
  is_free INTEGER NOT NULL,
  price_text TEXT NOT NULL,
  description TEXT NOT NULL,
  official_url TEXT,
  source_url TEXT NOT NULL,
  image_blob_key TEXT
);
--> statement-breakpoint
INSERT INTO events_v2 (
  id, title, venue, address, lat, lng, category, is_free, price_text,
  description, official_url, source_url, image_blob_key
)
SELECT
  e.id, e.title, e.venue, e.address, e.lat, e.lng, e.category, e.is_free,
  e.price_text, e.description, e.official_url, e.source_url, e.image_blob_key
FROM events e
WHERE e.id = (
  SELECT e2.id
  FROM events e2
  WHERE e2.title = e.title
    AND e2.venue = e.venue
    AND e2.address = e.address
    AND e2.source_url = e.source_url
  ORDER BY e2.start_date, e2.id
  LIMIT 1
);
--> statement-breakpoint
CREATE TABLE event_occurrences_v2 (
  id TEXT PRIMARY KEY NOT NULL,
  event_id TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  times_text TEXT NOT NULL,
  FOREIGN KEY (event_id) REFERENCES events_v2(id) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO event_occurrences_v2 (id, event_id, start_date, end_date, times_text)
SELECT
  e.id,
  (
    SELECT e2.id
    FROM events e2
    WHERE e2.title = e.title
      AND e2.venue = e.venue
      AND e2.address = e.address
      AND e2.source_url = e.source_url
    ORDER BY e2.start_date, e2.id
    LIMIT 1
  ),
  e.start_date,
  e.end_date,
  CASE
    WHEN lower(substr(e.times_text, 1, 3)) IN ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')
      AND instr(e.times_text, ' · ') > 0
    THEN substr(e.times_text, instr(e.times_text, ' · ') + 3)
    ELSE e.times_text
  END
FROM events e;
--> statement-breakpoint
CREATE TABLE event_favorites_v2 (
  event_id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO event_favorites_v2 (event_id, created_at)
SELECT
  (
    SELECT o.event_id
    FROM event_occurrences_v2 o
    WHERE o.id = f.event_id
    LIMIT 1
  ),
  MIN(f.created_at)
FROM event_favorites f
WHERE EXISTS (SELECT 1 FROM event_occurrences_v2 o WHERE o.id = f.event_id)
GROUP BY 1;
--> statement-breakpoint
UPDATE event_feedback
SET event_id = COALESCE(
  (SELECT o.event_id FROM event_occurrences_v2 o WHERE o.id = event_feedback.event_id LIMIT 1),
  event_id
);
--> statement-breakpoint
ALTER TABLE event_feedback ADD COLUMN occurrence_id TEXT;
--> statement-breakpoint
DROP TABLE event_favorites;
--> statement-breakpoint
DROP TABLE events;
--> statement-breakpoint
ALTER TABLE events_v2 RENAME TO events;
--> statement-breakpoint
ALTER TABLE event_occurrences_v2 RENAME TO event_occurrences;
--> statement-breakpoint
ALTER TABLE event_favorites_v2 RENAME TO event_favorites;
--> statement-breakpoint
CREATE INDEX events_title_idx ON events (title);
--> statement-breakpoint
CREATE INDEX event_occurrences_event_id_idx ON event_occurrences (event_id);
--> statement-breakpoint
CREATE INDEX event_occurrences_start_date_idx ON event_occurrences (start_date);
--> statement-breakpoint
UPDATE dataset_state
SET event_count = (SELECT COUNT(*) FROM events),
    last_synced_at = CAST(unixepoch('subsec') * 1000 AS INTEGER)
WHERE id = 1;
