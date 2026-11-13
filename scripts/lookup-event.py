#!/usr/bin/env python3
"""Slim event lookup for the morning curation flow.

Prints an already-curated event the way the AI should see it:
  - recurring events: full record MINUS the occurrences array, plus the
    recurrence rule and a coverage line ("materialized through <date>,
    N occurrence(s)"). The AI must not touch occurrences on these --
    materialize-recurrence.py owns them.
  - one-off events: printed whole (the AI may append occurrence dates).

Usage: lookup-event.py <event_id> [--events PATH]
"""

import argparse
import copy
import json
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("event_id")
    ap.add_argument("--events", default="events.json")
    args = ap.parse_args()

    with open(args.events) as f:
        events = json.load(f)

    event = next((e for e in events if e["id"] == args.event_id), None)
    if event is None:
        print(f"no event with id {args.event_id!r}", file=sys.stderr)
        return 1

    rule = event.get("recurrence")
    if rule:
        slim = copy.deepcopy(event)
        occs = slim.pop("occurrences", [])
        last = max((o["start_date"] for o in occs), default="?")
        print(json.dumps(slim, indent=2, ensure_ascii=False))
        print(
            f"\n[recurring: occurrences are script-owned "
            f"({len(occs)} materialized through {last}) -- do not edit them]"
        )
    else:
        print(json.dumps(event, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
