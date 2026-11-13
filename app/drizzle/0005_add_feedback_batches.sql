CREATE TABLE feedback_batches (
  id TEXT PRIMARY KEY NOT NULL,
  submitted_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE event_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  batch_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('exclude', 'fix')),
  note_text TEXT,
  submitted_at INTEGER NOT NULL,
  FOREIGN KEY (batch_id) REFERENCES feedback_batches(id) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX event_feedback_batch_id_idx ON event_feedback(batch_id);
--> statement-breakpoint
CREATE INDEX event_feedback_event_id_idx ON event_feedback(event_id);
