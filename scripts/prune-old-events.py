#!/usr/bin/env python3
"""Retention prune (standing rule, decided 2026-11-12).

Delete events that ended more than 2 months ago: an event is pruned when
its last occurrence's end_date is strictly before (today - 2 calendar
months). Ending exactly 2 months ago today is kept.

Canonical side only: removes the events from events.json, repairs
state.json post references (the 'events' lists in seen_posts), and
persists atomically via checkpoint.save_all. Writes the pruned IDs to
/tmp/pruned_ids.json so the publish step can delete the same IDs from
the artifact runtime with delete_event.

Usage:
  python3 prune-old-events.py [--today YYYY-MM-DD] [--apply]

Without --apply it is a dry run: it prints the cohort and writes nothing.
"""
import argparse
import calendar as cal
import json
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import checkpoint

WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')


def minus_two_months(d):
    y, m = d.year, d.month - 2
    if m <= 0:
        y, m = y - 1, m + 12
    day = min(d.day, cal.monthrange(y, m)[1])
    return date(y, m, day)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--today', default=None)
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()

    today = date.fromisoformat(args.today) if args.today else date.today()
    cutoff = minus_two_months(today)

    events = checkpoint.load_json(f"{WORK}/events.json")
    locations = checkpoint.load_json(f"{WORK}/locations.json")
    state = checkpoint.load_json(f"{WORK}/state.json")

    cohort = []
    for e in events:
        ends = [o['end_date'] for o in e.get('occurrences', [])]
        if not ends:
            print(f"WARN: event {e['id']} has no occurrences; left untouched")
            continue
        last_end = max(ends)
        if date.fromisoformat(last_end) < cutoff:
            cohort.append((e['id'], e['title'], last_end))

    print(f"today={today} cutoff(last end < {cutoff}): {len(cohort)} event(s)")
    for eid, title, last_end in sorted(cohort, key=lambda x: x[2]):
        print(f"  {last_end}  {eid}  {title}")

    if not args.apply:
        print("dry run — nothing written")
        return

    ids = {c[0] for c in cohort}
    events = [e for e in events if e['id'] not in ids]

    refs = 0
    for v in state.get('seen_posts', {}).values():
        if isinstance(v, dict) and isinstance(v.get('events'), list):
            if any(x in ids for x in v['events']):
                v['events'] = [x for x in v['events'] if x not in ids]
                refs += 1

    checkpoint.save_all(WORK, events, locations, state)
    with open('/tmp/pruned_ids.json', 'w') as f:
        json.dump(sorted(ids), f)
    print(f"applied: {len(ids)} event(s) pruned, {refs} state ref(s) repaired, "
          f"{len(events)} events remain; ids in /tmp/pruned_ids.json")


if __name__ == '__main__':
    main()
