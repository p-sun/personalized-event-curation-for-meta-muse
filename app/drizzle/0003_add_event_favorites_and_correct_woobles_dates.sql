CREATE TABLE event_favorites (
  event_id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
UPDATE events
SET start_date = '2026-09-04',
    end_date = '2026-09-07'
WHERE lower(title) LIKE '%wooble%';
