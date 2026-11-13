DROP TABLE entries;
--> statement-breakpoint
CREATE TABLE events (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  venue TEXT NOT NULL,
  address TEXT NOT NULL,
  lat REAL,
  lng REAL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  times_text TEXT NOT NULL,
  category TEXT NOT NULL,
  is_free INTEGER NOT NULL,
  price_text TEXT NOT NULL,
  description TEXT NOT NULL,
  official_url TEXT,
  source_url TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX events_start_date_idx ON events (start_date);
--> statement-breakpoint
CREATE TABLE dataset_state (
  id INTEGER PRIMARY KEY NOT NULL,
  event_count INTEGER NOT NULL,
  last_synced_at INTEGER NOT NULL
);
