#!/usr/bin/env python3
"""Dedup validation gate for events.json and state.json. Run after the AI's
curation edits (and after materialize-recurrence.py), before publish.

Fails (exit 1) when:
  - two events share the same normalized title at the same location
    (same name + same venue = same event: one record with occurrences,
    never two records), or
  - two events at the same location have near-identical titles (same first
    four normalized words) with overlapping occurrence dates, or
  - state.json references an event ID that does not exist in events.json
    (stale refs from a merge/rename/delete -- repair them, don't leave them).

Usage: validate-no-duplicates.py [--events PATH] [--state PATH]
"""

import argparse
import json
import re
import sys
from collections import defaultdict


def norm_title(t):
    t = (t or "").lower()
    t = re.sub(r"[^a-z0-9 ]", "", t)
    return re.sub(r"\s+", " ", t).strip()


def occurrence_dates(event):
    return {
        o.get("start_date")
        for o in event.get("occurrences", [])
        if o.get("start_date")
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--events", default="events.json")
    ap.add_argument("--state", default="state.json")
    args = ap.parse_args()

    with open(args.events) as f:
        events = json.load(f)
    with open(args.state) as f:
        state = json.load(f)

    errors = []

    # 1. Exact duplicates: same normalized title + same location.
    groups = defaultdict(list)
    for e in events:
        groups[(norm_title(e.get("title")), e.get("location_id"))].append(e["id"])
    for (title, loc), ids in sorted(groups.items()):
        if len(ids) > 1:
            errors.append(
                f"duplicate events at {loc}: same title {title!r} -> {ids} "
                "(merge into one record)"
            )

    # 2. Near duplicates: same location, same title prefix, overlapping dates.
    by_loc = defaultdict(list)
    for e in events:
        by_loc[e.get("location_id")].append(e)
    seen_pairs = set()
    for loc, es in by_loc.items():
        for i in range(len(es)):
            for j in range(i + 1, len(es)):
                a, b = es[i], es[j]
                if (a["id"], b["id"]) in seen_pairs:
                    continue
                seen_pairs.add((a["id"], b["id"]))
                wa = norm_title(a.get("title")).split()[:4]
                wb = norm_title(b.get("title")).split()[:4]
                if len(wa) < 2 or wa != wb:
                    continue
                if occurrence_dates(a) & occurrence_dates(b):
                    errors.append(
                        f"near-duplicate events at {loc}: {a['id']} <-> {b['id']} "
                        f"(titles share {wa}, dates overlap)"
                    )

    # 3. Dangling refs: state.json -> event IDs that don't exist.
    live = {e["id"] for e in events}
    dangling = defaultdict(set)
    for pid, v in state.get("seen_posts", {}).items():
        for eid in v.get("events", []):
            if eid not in live:
                dangling[eid].add(pid)
    for eid in sorted(dangling):
        errors.append(
            f"state.json references missing event {eid} "
            f"from {len(dangling[eid])} post(s) (remap or drop the ref)"
        )

    if errors:
        print("duplicate validation FAILED:")
        for e in errors:
            print("  -", e)
        return 1
    print(f"duplicate validation OK ({len(events)} event(s), no duplicates).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
