#!/usr/bin/env python3
"""Per-post checkpointing for the morning refresh merge.

The merge is the only writer of state.json. It checkpoints after every
curation slice -- merging that slice's events/locations and recording its
post->event mappings, then persisting events.json + locations.json +
state.json atomically -- so a stalled run's retry resumes instead of
reprocessing the whole backlog:

  - The IG pull drops every media ID already in state.json's seen_posts,
    so checkpointed posts are never re-fetched.
  - Slice building skips media IDs already in seen_posts, so checkpointed
    posts are never re-curated (the expensive LLM part).
  - The merge skips slices whose state_updates are all already recorded
    (slice_done), so checkpointed slices are never re-merged.

Granularity note: the checkpoint boundary is the curation slice (the unit
a curation subagent returns), while the ledger itself is per-post --
every processed post gets its own seen_posts entry. A crash mid-slice
loses at most that one slice's curation, whose input file still exists
on disk for a clean re-run.

Crash safety: every persist is write-temp-in-same-dir + fsync + os.replace,
so a crash can never leave a half-written JSON. All three files are
persisted in one call, in the order locations -> events -> state, so a
reader never sees an event pointing at a missing location or a mapping
pointing at a missing event.
"""
import json
import os
import tempfile

SEEN_POSTS_KEY = "seen_posts"


def atomic_write_json(path, obj):
    """Write obj as JSON to path atomically: temp file + fsync + rename."""
    directory = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def seen_posts(state):
    return state.setdefault(SEEN_POSTS_KEY, {})


def slice_done(state, state_updates):
    """True if every media ID in this slice's state_updates is already
    recorded -- i.e. the slice was checkpointed by an earlier (stalled) run
    and must be skipped on resume."""
    sp = state.get(SEEN_POSTS_KEY, {})
    return all(mid in sp for mid in state_updates)


def checkpoint_slice(work, events, locations, state, new_events, new_locations,
                     state_updates, today, report):
    """Merge one curation slice and checkpoint atomically.

    - new_locations: list of location records (location:hex ids); existing
      ids are left untouched.
    - new_events: list of event records; ids already in events.json are
      skipped (cross-slice duplicates land here on resume).
    - state_updates: {media_id: [event_ids]}; media IDs already recorded
      are left untouched (idempotent).
    Mutates events/locations/state in place, persists all three, appends
    human-readable lines to report. Returns (n_events, n_locs, n_posts).
    """
    loc_by_id = {l["id"]: l for l in locations}
    n_locs = 0
    for loc in new_locations:
        if loc["id"] not in loc_by_id:
            locations.append(loc)
            loc_by_id[loc["id"]] = loc
            n_locs += 1

    by_id = {e["id"]: e for e in events}
    n_events = 0
    for e in new_events:
        eid = e["id"]
        if e.get("location_id") not in loc_by_id:
            raise ValueError(f"unknown location_id {e.get('location_id')} on {eid}")
        if eid in by_id:
            report.append(f"checkpoint: DUP event already present, skipped: {eid}")
            continue
        e.setdefault("ig_mention_count", 0)
        events.append(e)
        by_id[eid] = e
        n_events += 1

    sp = seen_posts(state)
    n_posts = 0
    for mid, evs in state_updates.items():
        if mid not in sp:
            sp[mid] = {"events": list(evs), "processed_at": today}
            n_posts += 1

    atomic_write_json(os.path.join(work, "locations.json"), locations)
    atomic_write_json(os.path.join(work, "events.json"), events)
    atomic_write_json(os.path.join(work, "state.json"), state)
    report.append(
        f"checkpoint: slice persisted ({n_events} new events, {n_locs} new "
        f"locations, {n_posts} new post mappings); "
        f"{len(events)} events / {len(locations)} locations total"
    )
    return n_events, n_locs, n_posts


def save_all(work, events, locations, state):
    """Atomic persist of all three datasets (for phases after the slices,
    e.g. fetcher occurrence appends)."""
    atomic_write_json(os.path.join(work, "locations.json"), locations)
    atomic_write_json(os.path.join(work, "events.json"), events)
    atomic_write_json(os.path.join(work, "state.json"), state)
