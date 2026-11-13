#!/usr/bin/env python3
"""Re-anchor the kit's SAMPLE dataset to the current date.

The sample events are a fixture: their value is the relationships between
their dates (an event on the anchor day, a span crossing it, a weekly
recurrence, an event a few days later), not the calendar dates they were
authored on. This script shifts every date in the sample events.json by
(today - anchor), where the anchor is the earliest occurrence start, so
the landing view (today) is populated on any install date. Occurrence
start/end dates, recurrence first/last dates and weekday lists, dated
occurrence ids, the date tokens inside times_text, and state.json
processed_at stamps all shift together, keeping the records internally
consistent. Re-running it later re-anchors again; running it when the
anchor already is today is a no-op.

Dates are fixed when data is produced — the app never adjusts them at
read time — so freshness for the samples is maintained here, in the
pipeline, exactly as a real dataset's freshness is maintained by
re-running its refresh.

SAMPLE DATA ONLY. This shifts every date it finds; never run it against
a real dataset. As a guard it refuses to touch a dataset with more than
25 events.

Usage:
    python3 redate_sample_data.py --data <datasets dir> [--today YYYY-MM-DD]
"""

import argparse
import datetime as dt
import json
import os
import re
import sys

MAX_SAMPLE_EVENTS = 25

WD_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
WD_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
           "Saturday", "Sunday"]
MO_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MO_NUM = {name: i + 1 for i, name in enumerate(MO_ABBR)}

TOKEN = re.compile(
    r"(Mon|Tue|Wed|Thu|Fri|Sat|Sun), "
    r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2})")


def fmt_token(d):
    return f"{WD_ABBR[d.weekday()]}, {MO_ABBR[d.month - 1]} {d.day}"


def shift_timetext(text, mapping):
    """Rewrite date tokens in times_text via {(month, day): new date}."""
    def repl(m):
        key = (MO_NUM[m.group(2)], int(m.group(3)))
        new = mapping.get(key)
        return fmt_token(new) if new is not None else m.group(0)
    return TOKEN.sub(repl, text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True,
                    help="datasets folder holding events.json/state.json")
    ap.add_argument("--today", default=None,
                    help="anchor date YYYY-MM-DD (default: today, local)")
    args = ap.parse_args()

    today = (dt.date.fromisoformat(args.today) if args.today
             else dt.date.today())
    events_path = os.path.join(args.data, "events.json")
    with open(events_path, encoding="utf-8") as fh:
        events = json.load(fh)
    if len(events) > MAX_SAMPLE_EVENTS:
        sys.exit(f"refusing: {len(events)} events is not a sample dataset "
                 f"(limit {MAX_SAMPLE_EVENTS}) — never re-date real data")

    starts = [occ["start_date"] for ev in events
              for occ in ev.get("occurrences", [])]
    starts += [ev["recurrence"]["first_date"] for ev in events
               if ev.get("recurrence")]
    if not starts:
        sys.exit("no occurrence dates found — nothing to re-anchor")
    anchor = dt.date.fromisoformat(min(starts))
    delta = (today - anchor).days
    if delta == 0:
        print(f"sample data already anchored at {today} — no shift")
        return

    def shifted(iso):
        return dt.date.fromisoformat(iso) + dt.timedelta(days=delta)

    for ev in events:
        occ_weekdays = []
        for occ in ev.get("occurrences", []):
            old_start = dt.date.fromisoformat(occ["start_date"])
            old_end = dt.date.fromisoformat(occ["end_date"])
            mapping = {(old_start.month, old_start.day):
                       old_start + dt.timedelta(days=delta),
                       (old_end.month, old_end.day):
                       old_end + dt.timedelta(days=delta)}
            occ["start_date"] = mapping[(old_start.month, old_start.day)] \
                .isoformat()
            occ["end_date"] = mapping[(old_end.month, old_end.day)] \
                .isoformat()
            if occ.get("id", "").endswith("-" + old_start.isoformat()):
                occ["id"] = occ["id"][:-len(old_start.isoformat())] \
                    + occ["start_date"]
            if occ.get("times_text"):
                occ["times_text"] = shift_timetext(occ["times_text"],
                                                   mapping)
            occ_weekdays.append(WD_FULL[dt.date.fromisoformat(
                occ["start_date"]).weekday()])
        rec = ev.get("recurrence")
        if rec:
            rec["first_date"] = shifted(rec["first_date"]).isoformat()
            rec["last_date"] = shifted(rec["last_date"]).isoformat()
            if occ_weekdays:
                rec["days_of_week"] = sorted(set(occ_weekdays),
                                             key=WD_FULL.index)
    with open(events_path, "w", encoding="utf-8") as fh:
        json.dump(events, fh, indent=1, ensure_ascii=False)
        fh.write("\n")

    state_path = os.path.join(args.data, "state.json")
    if os.path.exists(state_path):
        with open(state_path, encoding="utf-8") as fh:
            state = json.load(fh)
        changed = False
        for post in state.get("seen_posts", {}).values():
            if post.get("processed_at"):
                try:
                    post["processed_at"] = shifted(
                        post["processed_at"]).isoformat()
                    changed = True
                except ValueError:
                    pass
        if changed:
            with open(state_path, "w", encoding="utf-8") as fh:
                json.dump(state, fh, indent=1, ensure_ascii=False)
                fh.write("\n")

    new_starts = [occ["start_date"] for ev in events
                  for occ in ev.get("occurrences", [])]
    print(f"re-anchored {len(events)} sample events: {anchor} -> {today} "
          f"({delta:+d}d); occurrences now span "
          f"{min(new_starts)} .. {max(new_starts)}")


if __name__ == "__main__":
    main()
