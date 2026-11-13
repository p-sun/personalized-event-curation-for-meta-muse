#!/usr/bin/env python3
"""Validation gate for recurring events in events.json. Run after the AI's
curation edits and after materialize-recurrence.py, before publish.

Fails (exit 1) when:
  - a `recurrence` rule is malformed (bad keys, day names, dates, times), or
  - an event's `occurrences` do not exactly match its rule's expansion
    (i.e. materialize-recurrence.py was not run, or someone hand-edited
    occurrences on a recurring event).

Usage: validate-recurrence.py [--events PATH]
"""

import argparse
import datetime as dt
import importlib.util
import json
import sys

SPEC = importlib.util.spec_from_file_location(
    "materialize", "materialize-recurrence.py"
)
materialize = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(materialize)

REQUIRED_KEYS = {
    "frequency", "days_of_week", "first_date",
    "last_date", "start_time", "end_time",
}
VALID_DAYS = set(materialize.DAY_TO_NUM)


def check_time(s, errors, where):
    try:
        h, m = (int(x) for x in s.split(":"))
        assert 0 <= h <= 23 and 0 <= m <= 59 and len(s) == 5
        return h * 60 + m
    except Exception:
        errors.append(f"{where}: bad HH:MM time {s!r}")
        return None


def check_date(s, errors, where):
    try:
        return dt.date.fromisoformat(s)
    except Exception:
        errors.append(f"{where}: bad ISO date {s!r}")
        return None


def validate_rule(event_id, rule, errors):
    if not isinstance(rule, dict):
        errors.append(f"{event_id}: recurrence must be an object")
        return
    missing = REQUIRED_KEYS - set(rule)
    if missing:
        errors.append(f"{event_id}: recurrence missing keys {sorted(missing)}")
    if rule.get("frequency") != "weekly":
        errors.append(
            f"{event_id}: unsupported frequency {rule.get('frequency')!r} "
            "(only 'weekly')"
        )
    days = rule.get("days_of_week")
    if not isinstance(days, list) or not days or not set(days) <= VALID_DAYS:
        errors.append(f"{event_id}: bad days_of_week {days!r}")
    first = check_date(rule.get("first_date"), errors, event_id)
    last = (
        check_date(rule["last_date"], errors, event_id)
        if rule.get("last_date") is not None
        else None
    )
    if first and last and last < first:
        errors.append(f"{event_id}: last_date {rule['last_date']} < first_date")
    start = check_time(rule.get("start_time"), errors, event_id)
    end = check_time(rule.get("end_time"), errors, event_id)
    if start is not None and end is not None and end <= start:
        errors.append(f"{event_id}: end_time must be after start_time")
    for s in rule.get("skip_dates", []):
        check_date(s, errors, f"{event_id} skip_dates")
    overrides = rule.get("overrides", {})
    if not isinstance(overrides, dict):
        errors.append(f"{event_id}: overrides must be an object")
    else:
        for s in overrides:
            check_date(s, errors, f"{event_id} overrides")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--events", default="events.json")
    args = ap.parse_args()

    with open(args.events) as f:
        events = json.load(f)

    errors = []
    today = dt.date.today()
    for event in events:
        rule = event.get("recurrence")
        if not rule:
            continue
        eid = event["id"]
        validate_rule(eid, rule, errors)
        if not errors or True:  # expansion check runs regardless of shape errors
            try:
                want = materialize.expand(rule, today)
            except Exception as exc:
                errors.append(f"{eid}: cannot expand rule: {exc}")
                continue
            if event.get("occurrences") != want:
                errors.append(
                    f"{eid}: occurrences do not match the recurrence rule -- "
                    "run materialize-recurrence.py"
                )

    if errors:
        print("recurrence validation FAILED:")
        for e in errors:
            print("  -", e)
        return 1
    n = sum(1 for e in events if e.get("recurrence"))
    print(f"recurrence validation OK ({n} recurring event(s)).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
