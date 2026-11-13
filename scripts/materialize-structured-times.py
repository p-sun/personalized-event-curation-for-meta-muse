#!/usr/bin/env python3
"""Materialize structured start_time/end_time on occurrences in events.json.

Derives "HH:MM" (24h local wall time) from each occurrence's times_text
using publish_filter's prose parser — the single source of truth for time
parsing — so the 4pm publish rule reads occurrence data instead of
re-parsing prose, with zero LLM token cost and zero transcription error.

Rules (safe by construction, not by discipline):
- Only fills occurrences that LACK end_time. Never overwrites an existing
  value: a hand-set structured time (e.g. overriding a parser misparse)
  always wins.
- Only writes when times_text contains EXACTLY ONE unambiguous time range.
  Multi-range prose (per-day-varying hours), midnight ends (unrepresentable
  as HH:MM), and range-less prose ("Museum hours", single times) are left
  alone — the filter falls back to prose parsing for those, same as before.
- Skips generated occurrences: materialize-recurrence.py owns those and
  already carries the rule's times.

Curation contract (see CURATION.md): if you edit an occurrence's
times_text, delete its start_time/end_time so this script re-derives them —
unless you set them deliberately to override the parser, in which case
update them to match.

Usage:
    materialize-structured-times.py [--check] [--events PATH]
    --check     exit 2 (without writing) if any occurrence would change.
    --unparsed  list upcoming occurrences with no usable end time from
                either source (the agent's worklist: data typo or parser
                gap). Not part of the daily run — use when extending
                parser coverage.
"""

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from publish_filter import (_RANGE_RE, _to24, _norm_mer, parse_end_minutes,
                            parse_hhmm, _range_minutes)


def single_range(times_text):
    """(start_min, end_min) if exactly one valid time range exists, else None.

    Validity mirrors parse_end_minutes: a range needs a meridiem on at
    least one side (or a noon/midnight keyword), so date ranges never match.
    """
    matches = []
    for m in _RANGE_RE.finditer(times_text or ""):
        r = _range_minutes(m)
        if r is None:
            continue  # date range, not a time range
        matches.append(r)
    return matches[0] if len(matches) == 1 else None


def fmt(m):
    return "%02d:%02d" % (m // 60, m % 60)


def materialize(events):
    """Fill absent structured times in place. Returns (filled, event_ids)."""
    filled = []
    for ev in events:
        for occ in ev.get("occurrences") or []:
            if occ.get("generated") or occ.get("end_time"):
                continue
            r = single_range(occ.get("times_text"))
            if r is None:
                continue
            start_min, end_min = r
            if end_min == 24 * 60:
                continue  # midnight end: unrepresentable as HH:MM
            # The filter must see the same end through prose parsing.
            assert parse_end_minutes(occ.get("times_text")) == end_min, (
                ev.get("id"), occ.get("times_text"))
            occ["start_time"] = fmt(start_min)
            occ["end_time"] = fmt(end_min)
            filled.append(ev.get("id"))
    return filled


def unparsed(events, today):
    """Upcoming occurrences with no usable end time from either source.

    No valid structured end_time AND prose parsing fails -> the 4pm rule
    fails open on these (kept, never dropped). This is the agent's
    worklist: fix the times_text typo, or extend the parser (with a test)
    if it's a legitimate format the parser should handle. Fully-past
    occurrences are excluded — the filter never touches those.
    """
    rows = []
    for ev in events:
        for occ in ev.get("occurrences") or []:
            ed = occ.get("end_date") or occ.get("start_date") or ""
            if ed < today:
                continue
            if parse_hhmm(occ.get("end_time")) is not None:
                continue
            if parse_end_minutes(occ.get("times_text")) is not None:
                continue
            rows.append((ev.get("id"), occ.get("start_date"), ed,
                         occ.get("times_text")))
    return rows


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--unparsed", action="store_true",
                    help="list upcoming occurrences with no usable end time "
                         "(agent worklist: data typo or parser gap)")
    ap.add_argument("--today", default=None, help="YYYY-MM-DD")
    ap.add_argument("--events", default="events.json")
    args = ap.parse_args(argv)

    with open(args.events) as f:
        events = json.load(f)

    if args.unparsed:
        from datetime import date as date_cls
        today = args.today or date_cls.today().isoformat()
        rows = unparsed(events, today)
        for eid, sd, ed, tt in rows:
            span = sd if sd == ed else "%s to %s" % (sd, ed)
            print("%s | %s | %s" % (eid, span, tt))
        print("(%d occurrence(s) with no usable end time)" % len(rows))
        return 0

    # Work on a copy for --check so the file is untouched.
    import copy
    probe = copy.deepcopy(events)
    filled = materialize(probe)

    if args.check:
        if filled:
            print("would fill structured times for: "
                  + ", ".join(sorted(set(filled))))
            return 2
        print("structured times already materialized.")
        return 0

    if filled:
        with open(args.events, "w") as f:
            json.dump(probe, f, indent=2, ensure_ascii=False)
            f.write("\n")
    print("materialized structured times for %d occurrence(s) across %d "
          "event(s)" % (len(filled), len(set(filled))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
