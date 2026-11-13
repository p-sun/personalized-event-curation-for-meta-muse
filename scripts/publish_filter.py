#!/usr/bin/env python3
"""
publish_filter.py — the SINGLE decision point for the 4pm publish rule.

Architecture (approved 2026-09-23): events.json holds ALL curated events,
including ones that violate the 4pm rule. Fetchers and curation never make
4pm decisions — they emit candidates with accurate times_text. This module
alone decides what reaches the website, applied once when building the
publish payload.

Rule: drop an upcoming occurrence iff it is not Broadway-related, every day
in its REMAINING span (from today through end_date) is a weekday (Mon-Fri),
its end time parses, and the end is before 4:00pm. A span touching any
weekend day is kept — it is attendable that day. Unknown/unparseable end
times fail open (kept). Fully-past occurrences (end_date < today) are never
touched — the rule is not applied retroactively.

API:
    parse_end_minutes(times_text) -> int | None  (minutes since midnight)
    parse_hhmm("HH:MM") -> int | None  (minutes since midnight)
    occurrence_end_minutes(occ) -> int | None
        (prefers the occurrence's structured "end_time" when valid,
        falls back to parsing "times_text")
    is_broadway(event) -> bool
    is_weekday(date_str) -> bool
    filter_for_publish(events, today) -> (payload_events, excluded)

An occurrence may carry structured "start_time"/"end_time" ("HH:MM", 24h,
local wall time) alongside "times_text", which stays the display string.
The filter prefers the structured end when it is valid; prose parsing is
the fallback. Structured times are derived, not curated:
materialize-structured-times.py fills them deterministically from
times_text (recurrence-generated occurrences carry the rule's times);
curation's only duty is accurate times_text (see CURATION.md).

CLI:
    python3 publish_filter.py --events events.json --out /tmp/publish_payload.json \
        --excluded-out /tmp/publish_excluded.json --today 2026-09-23
"""

import argparse
import copy
import json
import re
import sys
from datetime import date as date_cls, timedelta

FOUR_PM_MINUTES = 16 * 60

# One side of a time range: a keyword, or a number with an optional meridiem.
# The meridiem letter alone ("8:30a", "4p") counts — the "m" is optional.
_NUM = r"(?P<h>\d{1,2})(?::(?P<min>\d{2}))?\s*(?P<mer>[ap](?:\.?m\.?)?)?"
_SIDE = r"(?:(?P<kw>noon|midnight)|" + _NUM + r")"
_RANGE_RE = re.compile(
    _SIDE.replace("(?P<h>", "(?P<s_h>", 1)
         .replace("(?P<min>", "(?P<s_min>", 1)
         .replace("(?P<mer>", "(?P<s_mer>", 1)
         .replace("(?P<kw>", "(?P<s_kw>", 1)
    + r"\s*[-–—]\s*" +
    _SIDE.replace("(?P<h>", "(?P<e_h>", 1)
         .replace("(?P<min>", "(?P<e_min>", 1)
         .replace("(?P<mer>", "(?P<e_mer>", 1)
         .replace("(?P<kw>", "(?P<e_kw>", 1),
    re.I,
)


def _to24(hour, mer):
    h = int(hour)
    if mer == "p" and h != 12:
        h += 12
    if mer == "a" and h == 12:
        h = 0
    return h


def _norm_mer(mer):
    if not mer:
        return None
    return mer.strip().lower()[0]  # "a", "am", "a.m." -> "a"


def _range_minutes(m):
    """(start_min, end_min) for one _RANGE_RE match, or None if not a time range.

    A range needs a meridiem on at least one side (or a noon/midnight
    keyword), so date ranges like "Sep 12–13" never match.
    A numeric 12am END with a later-in-the-day start ("6pm–12am",
    "11:30am–12am") means midnight at end of day (24:00), matching the
    "midnight" keyword. Without this, 12am parses to 0 and the 4pm rule
    drops an evening event that runs past 4pm.
    """
    s_kw = m.group("s_kw")
    e_kw = m.group("e_kw")
    s_mer = _norm_mer(m.group("s_mer"))
    e_mer = _norm_mer(m.group("e_mer"))
    if not s_kw and not e_kw and not s_mer and not e_mer:
        return None  # date range, not a time range
    if s_kw:
        start_min = 720 if s_kw.lower() == "noon" else 0
    else:
        s_eff = s_mer or e_mer  # bare start inherits the end's meridiem
        start_min = (_to24(m.group("s_h"), s_eff) * 60
                     + int(m.group("s_min") or 0))
    if e_kw:
        end_min = 720 if e_kw.lower() == "noon" else 24 * 60
    else:
        e_eff = e_mer or s_mer  # bare end inherits the start's meridiem
        end_min = (_to24(m.group("e_h"), e_eff) * 60
                   + int(m.group("e_min") or 0))
        if (m.group("e_h") == "12" and (m.group("e_min") or "00") == "00"
                and e_eff == "a" and end_min <= start_min):
            end_min = 24 * 60  # numeric 12am end = midnight end of day
    return start_min, end_min


def parse_end_minutes(times_text):
    """Minutes since midnight of the occurrence END, or None if unknown.

    Handles "2:00pm-8:00pm", "11am–6pm" (en/em dashes), "8:30a–4p",
    "6–7pm" (bare start inherits the end's meridiem), "12:30–1:30pm",
    "11am–noon", "9am–midnight" (midnight end = 24:00, runs past 4pm),
    "6pm–12am" (numeric 12am end with an evening start = midnight end of
    day = 24:00), "10pm–2am" (midnight crossover -> 120). A range needs a
    meridiem on at least one side (or a noon/midnight keyword), so date
    ranges like "Sat–Sun, Sep 12–13" never match. The LAST valid range
    wins, since date prefixes ("Thu, Sep 10 · 11am–7pm") precede the hours.

    Returns None for single times ("8pm", "Wed, Sep 16 · 5pm"),
    unparseable text ("evening", "daytime", "Museum hours"), and empty
    input — the caller fails open (keeps the occurrence).

    Mechanical edge: "10pm–2am" ends at 2am < 4pm -> dropped. Rare in this
    dataset; the rule stays mechanical rather than guessing intent.
    """
    if not times_text:
        return None
    best = None
    for m in _RANGE_RE.finditer(times_text):
        r = _range_minutes(m)
        if r is None:
            continue  # date range like "Sep 12–13", not a time range
        best = r[1]
    return best


def parse_hhmm(s):
    """Minutes since midnight for a 24h "HH:MM" string, or None if invalid.

    "9:30" and "09:30" both parse. "24:00", "9:60", "nope", "" and None
    return None — the caller falls back to prose parsing (fail open).
    """
    if not isinstance(s, str):
        return None
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", s.strip())
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    if h > 23 or mi > 59:
        return None
    return h * 60 + mi


def occurrence_end_minutes(occ):
    """Minutes since midnight of the occurrence END, or None if unknown.

    Prefers the occurrence's structured "end_time" ("HH:MM", 24h local)
    when it is present and valid; otherwise falls back to
    parse_end_minutes(occ["times_text"]). None means fail open (kept).
    """
    structured = parse_hhmm(occ.get("end_time"))
    if structured is not None:
        return structured
    return parse_end_minutes(occ.get("times_text"))


def is_broadway(event):
    """Broadway-related events are exempt from the 4pm rule, any time."""
    text = "%s %s" % (event.get("title") or "", event.get("description") or "")
    return "broadway" in text.lower()


def is_weekday(date_str):
    """Mon–Fri from YYYY-MM-DD. Unparseable dates fail open (not weekday)."""
    try:
        return date_cls.fromisoformat(date_str).weekday() < 5
    except (ValueError, TypeError):
        return False


def _span_has_weekend(start_date, end_date):
    """True if any date in [start_date, end_date] is Sat/Sun.

    Unparseable dates fail open (False). An end before the start (bad data)
    is treated as a single day.
    """
    try:
        s = date_cls.fromisoformat(start_date)
        e = date_cls.fromisoformat(end_date)
    except (ValueError, TypeError):
        return False
    if e < s:
        e = s
    d = s
    while d <= e:
        if d.weekday() >= 5:
            return True
        d += timedelta(days=1)
    return False


def _violates(occ, broadway, today):
    """True if this occurrence must be dropped from the payload.

    Judges the REMAINING span: [max(start_date, today), end_date]. A span
    touching a weekend day is attendable and kept. Otherwise the weekday
    end-time rule applies to the span as a whole.
    """
    if broadway:
        return False
    sd = occ.get("start_date") or ""
    try:
        date_cls.fromisoformat(sd)
    except (ValueError, TypeError):
        return False  # unparseable/missing start date: fail open
    ed = occ.get("end_date") or sd
    eff_start = sd if sd >= today else today  # remaining span, ISO compares chronologically
    if _span_has_weekend(eff_start, ed):
        return False
    if not is_weekday(eff_start):
        return False
    end = occurrence_end_minutes(occ)
    return end is not None and end < FOUR_PM_MINUTES


def filter_for_publish(events, today):
    """Split events into (payload_events, excluded).

    Fully-past occurrences (end_date < today) are kept untouched. Otherwise
    the 4pm rule is judged on the occurrence's REMAINING span (from today
    through end_date): a span touching any weekend day is attendable and
    kept; an all-weekday span ending before 4pm (non-Broadway) is dropped.
    payload_events are deep copies with filtered occurrences; events left
    with zero occurrences are omitted. excluded lists every dropped
    occurrence plus fully-omitted events (with a reason).
    """
    payload = []
    excluded = []
    for ev in events:
        broadway = is_broadway(ev)
        kept, dropped = [], []
        for occ in ev.get("occurrences") or []:
            sd = occ.get("start_date") or ""
            ed = occ.get("end_date") or sd
            if ed < today:
                kept.append(occ)  # fully past: never filtered retroactively
            elif _violates(occ, broadway, today):
                dropped.append({"start_date": sd, "end_date": ed,
                                "times_text": occ.get("times_text"),
                                "start_time": occ.get("start_time"),
                                "end_time": occ.get("end_time")})
            else:
                kept.append(occ)
        if kept:
            out = copy.deepcopy(ev)
            out["occurrences"] = kept
            payload.append(out)
        if dropped or not kept:
            entry = {"event_id": ev.get("id"), "title": ev.get("title"),
                     "dropped": dropped}
            if not kept:
                entry["reason"] = "no publishable occurrences"
            excluded.append(entry)
    return payload, excluded


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Build the publish payload: the single decision point "
                    "for the 4pm rule (weekday occurrences ending before "
                    "4pm, Broadway exempt).")
    ap.add_argument("--events", required=True, help="events.json input")
    ap.add_argument("--out", required=True, help="filtered payload JSON output")
    ap.add_argument("--excluded-out", required=True,
                    help="excluded-occurrences report JSON output")
    ap.add_argument("--today", default=None,
                    help="YYYY-MM-DD (default: current date)")
    args = ap.parse_args(argv)
    today = args.today or date_cls.today().isoformat()
    with open(args.events) as f:
        events = json.load(f)
    payload, excluded = filter_for_publish(events, today)
    with open(args.out, "w") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)
    with open(args.excluded_out, "w") as f:
        json.dump(excluded, f, indent=1, ensure_ascii=False)
    n_dropped = sum(len(x["dropped"]) for x in excluded)
    print("events in: %d, payload events: %d, excluded events: %d, "
          "upcoming occurrences dropped: %d"
          % (len(events), len(payload), len(excluded), n_dropped))
    return 0


if __name__ == "__main__":
    sys.exit(main())
