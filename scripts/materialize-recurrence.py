#!/usr/bin/env python3
"""Materialize recurring events' occurrences in events.json.

For every event carrying a `recurrence` rule, this script OWNS the
`occurrences` array: it recomputes it deterministically from the rule and
replaces whatever is there. Hand edits to those arrays are discarded by
design -- see CURATION.md ("Recurring events").

Rule schema:
    "recurrence": {
        "frequency": "weekly",                 # only "weekly" is supported
        "days_of_week": ["Tuesday", "Sunday"], # full English day names
        "first_date": "2026-09-13",            # first date the rule applies
        "last_date": null,                     # last date, or null = indefinite
        "start_time": "16:00",                 # 24h "HH:MM"
        "end_time": "17:30",
        "skip_dates": ["2026-11-03"],          # optional: dates to skip
        "overrides": {                         # optional: per-date patches
            "2026-09-13": {"times_text": "Sun, Sep 13 · 4-5:30pm"}
        }
    }

Expansion: one occurrence per matching weekday from first_date through
min(today + MATERIALIZE_DAYS, last_date). Each occurrence is
{"start_date", "end_date", "times_text", "start_time", "end_time",
"generated": true}, sorted by start_date — the structured "HH:MM" times
come straight from the rule, so consumers never re-parse the prose. Past
occurrences are part of the expansion, so "keep past occurrences forever"
holds without extra bookkeeping. If an override patches "times_text" for
a date, the structured times are dropped for that occurrence (the prose
may describe different hours) unless the override sets them explicitly.

Usage:
    materialize-recurrence.py [--check] [--events PATH]
    --check  exit 2 (without writing) if any occurrence array would change.
"""

import argparse
import copy
import datetime as dt
import json
import sys

MATERIALIZE_DAYS = 60  # rolling horizon for future occurrences

DAY_TO_NUM = {
    "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
    "Friday": 4, "Saturday": 5, "Sunday": 6,
}


def parse_iso_date(s):
    return dt.date.fromisoformat(s)


def format_time(hhmm):
    """'16:00' -> '4pm', '17:30' -> '5:30pm', '12:00' -> '12pm'."""
    h, m = (int(x) for x in hhmm.split(":"))
    suffix = "am" if h < 12 else "pm"
    h12 = h % 12 or 12
    return f"{h12}{suffix}" if m == 0 else f"{h12}:{m:02d}{suffix}"


def format_times_text(d, start_time, end_time):
    # "Tue, Sep 15 · 4–5:30pm" -- matches the existing times_text style.
    return (
        f"{d.strftime('%a')}, {d.strftime('%b')} {d.day} "
        f"\u00b7 {format_time(start_time)}\u2013{format_time(end_time)}"
    )


def expand(rule, today):
    """Return the full deterministic occurrence list for a rule."""
    if rule.get("frequency") != "weekly":
        raise ValueError(f"unsupported frequency: {rule.get('frequency')!r}")
    day_nums = {DAY_TO_NUM[name] for name in rule["days_of_week"]}
    first = parse_iso_date(rule["first_date"])
    last = parse_iso_date(rule["last_date"]) if rule.get("last_date") else None
    horizon = today + dt.timedelta(days=MATERIALIZE_DAYS)
    end = min(horizon, last) if last else horizon
    skip = {parse_iso_date(s) for s in rule.get("skip_dates", [])}
    overrides = rule.get("overrides", {})

    occurrences = []
    d = first
    while d <= end:
        if d.weekday() in day_nums and d not in skip:
            iso = d.isoformat()
            occ = {
                "start_date": iso,
                "end_date": iso,
                "times_text": format_times_text(
                    d, rule["start_time"], rule["end_time"]
                ),
                "start_time": rule["start_time"],
                "end_time": rule["end_time"],
                "generated": True,
            }
            ov = overrides.get(iso)
            if ov:
                occ.update(ov)
                if ("times_text" in ov and "start_time" not in ov
                        and "end_time" not in ov):
                    # Overridden prose may describe different hours; the
                    # rule's structured times can no longer be trusted.
                    occ.pop("start_time", None)
                    occ.pop("end_time", None)
            occurrences.append(occ)
        d += dt.timedelta(days=1)
    return occurrences


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--events", default="events.json")
    args = ap.parse_args()

    with open(args.events) as f:
        events = json.load(f)

    today = dt.date.today()
    changed = []
    for event in events:
        rule = event.get("recurrence")
        if not rule:
            continue
        want = expand(rule, today)
        if event.get("occurrences") != want:
            changed.append(event["id"])
            event["occurrences"] = want

    if args.check:
        if changed:
            print("would rewrite occurrences for: " + ", ".join(changed))
            return 2
        print("occurrences already match recurrence rules.")
        return 0

    if changed:
        with open(args.events, "w") as f:
            json.dump(events, f, indent=2, ensure_ascii=False)
            f.write("\n")
    print(f"materialized {len(changed)} event(s): " + (", ".join(changed) or "none"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
