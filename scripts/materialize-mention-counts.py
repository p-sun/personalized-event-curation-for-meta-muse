#!/usr/bin/env python3
"""Materialize IG mention counts into events.json.

Popularity signal: for each event, the number of Instagram posts in
state.json whose `events` list contains it. Recomputed deterministically
every run from state.json -- the AI never hand-edits ig_mention_count,
the same way it never hand-edits materialized occurrences.

Only IG-sourced posts count -- which is every entry in state.json: the
`via` value only records which pipeline path processed the Instagram post
(seed, instagram_fanout, saved_collection, social_search, refresh).
Website-fetcher listings never create seen_post entries (fetchers keep
their own checkpoints), so no filtering is needed.
Events with no IG mentions get 0.

Run after the AI's curation edits (which update state.json), before
validate-no-duplicates.py and publish.

Usage: materialize-mention-counts.py [--events PATH] [--state PATH]
"""

import argparse
import json


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--events", default="events.json")
    ap.add_argument("--state", default="state.json")
    args = ap.parse_args()

    with open(args.events) as f:
        events = json.load(f)
    with open(args.state) as f:
        state = json.load(f)

    counts = {}
    for v in state.get("seen_posts", {}).values():
        for eid in v.get("events", []):
            counts[eid] = counts.get(eid, 0) + 1

    for e in events:
        e["ig_mention_count"] = counts.get(e["id"], 0)

    with open(args.events, "w") as f:
        json.dump(events, f, indent=2, ensure_ascii=False)

    mentioned = sum(1 for e in events if e["ig_mention_count"] > 0)
    top = sorted(events, key=lambda e: -e["ig_mention_count"])[:5]
    print(f"mention counts materialized: {mentioned}/{len(events)} "
          f"events mentioned.")
    for e in top:
        print(f"  {e['ig_mention_count']:3d}  {e['id']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
