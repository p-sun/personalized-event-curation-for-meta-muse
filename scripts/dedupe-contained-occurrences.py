#!/usr/bin/env python3
"""Remove single-day occurrences contained in a spanning occurrence.

Curation contract (CURATION.md): a genuine multi-day run is ONE occurrence
with a start/end range. The daily append path sometimes adds a single-day
occurrence for a date the spanning occurrence already covers (its dedup
check only compared exact start_dates). The app then renders the event
twice for that date: once as the single day, once as the full range.

This script deterministically drops a single-day occurrence iff another
occurrence of the SAME event is a strict span (start_date < end_date)
with span.start_date <= day <= span.end_date.

Safety:
- Events with a `recurrence` rule are skipped: materialize-recurrence.py
  owns their occurrences arrays and never emits spanning occurrences.
- Only single-day occurrences are ever removed; spanning occurrences
  are never touched.
- The spanning occurrence always carries the hours (the contained
  single-day copies were appended with no new information), so the 4pm
  publish filter and structured-time derivation keep working off it.

Usage: python3 dedupe-contained-occurrences.py [--check]
  --check: exit 1 if any contained single-day occurrence exists (for CI);
           otherwise removes them and rewrites events.json.
"""
import json
import sys
import os

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data') + '/'
PATH = BASE + 'events.json'

check_only = '--check' in sys.argv

events = json.load(open(PATH))
removed = []

for e in events:
    if 'recurrence' in e:
        continue
    occs = e.get('occurrences', [])
    # end_date defaults to start_date: a missing end_date is a single-day
    # occurrence, never a span (2026-09-28: a merge wrote 18 occurrences
    # without end_date and crashed this script with KeyError).
    ends = [o.get('end_date', o['start_date']) for o in occs]
    spans = [(o['start_date'], en) for o, en in zip(occs, ends)
             if o['start_date'] < en]
    if not spans:
        continue
    keep = []
    for o, en in zip(occs, ends):
        if o['start_date'] == en and any(
                s <= o['start_date'] <= e2 for s, e2 in spans):
            removed.append((e['id'], o['start_date'], o.get('times_text', '')))
        else:
            keep.append(o)
    if len(keep) != len(occs):
        e['occurrences'] = sorted(keep, key=lambda o: (o['start_date'], o.get('end_date', o['start_date'])))

if removed:
    print(f"contained single-day occurrences: {len(removed)}")
    for eid, day, tt in removed:
        print(f"  - {eid} {day} ({tt})")
else:
    print("contained single-day occurrences: 0")

if check_only and removed:
    sys.exit(1)

if removed and not check_only:
    json.dump(events, open(PATH, 'w'), indent=1, ensure_ascii=False)
    print(f"rewrote {PATH}")
