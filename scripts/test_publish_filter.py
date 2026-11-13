#!/usr/bin/env python3
"""Tests for publish_filter.py — plain asserts, run with: python3 test_publish_filter.py"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from publish_filter import (
    parse_end_minutes, is_broadway, is_weekday, filter_for_publish,
)

# 2026-09-23 is a Wednesday; 2026-09-26 a Saturday; 2026-09-16 a past Wednesday.
TODAY = "2026-09-23"
WED = "2026-09-23"
SAT = "2026-09-26"
PAST_WED = "2026-09-16"


def ev(eid, title, occs, desc=""):
    return {"id": eid, "title": title, "description": desc,
            "occurrences": [{"id": eid, "start_date": d, "times_text": t}
                            for d, t in occs]}


def check(name, cond):
    assert cond, "FAILED: %s" % name
    print("ok: %s" % name)


# --- parse_end_minutes ---
check("range hyphen", parse_end_minutes("2:00pm-8:00pm") == 1200)
check("range en dash", parse_end_minutes("11am–6pm") == 1080)
check("bare meridiem letters", parse_end_minutes("8:30a–4p") == 960)
check("start inherits end meridiem", parse_end_minutes("12:30–1:30pm") == 810)
check("noon end", parse_end_minutes("11am-noon") == 720)
check("midnight crossover", parse_end_minutes("10pm–2am") == 120)
check("midnight end runs past 4pm", parse_end_minutes("9am–midnight") == 1440)
check("numeric 12am end with evening start = midnight", parse_end_minutes("6pm–12am") == 1440)
check("numeric 12am end with morning start = midnight", parse_end_minutes("11:30am–12am") == 1440)
check("12am-2am crossover unchanged", parse_end_minutes("12am–2am") == 120)
check("noon start", parse_end_minutes("noon–5pm") == 1020)
check("bare start inherits pm", parse_end_minutes("6–7pm") == 1140)
check("date-prefixed range", parse_end_minutes("Thu, Sep 10 · 11am–7pm") == 1140)
check("single time -> None", parse_end_minutes("8pm") is None)
check("date-prefixed single time -> None",
      parse_end_minutes("Wed, Sep 16 · 5pm") is None)
check("unparseable -> None", parse_end_minutes("evening") is None)
check("museum hours -> None", parse_end_minutes("Museum hours") is None)
check("date range not a time range",
      parse_end_minutes("Sat–Sun, Sep 12–13") is None)
check("None -> None", parse_end_minutes(None) is None)
check("empty -> None", parse_end_minutes("") is None)

# --- is_weekday / is_broadway ---
check("wed is weekday", is_weekday("2026-09-23") is True)
check("sat not weekday", is_weekday("2026-09-26") is False)
check("sun not weekday", is_weekday("2026-09-27") is False)
check("bad date fails open", is_weekday("not-a-date") is False)
check("broadway in title",
      is_broadway({"title": "Broadway Flea Market", "description": ""}) is True)
check("broadway in description",
      is_broadway({"title": "Flea Market",
                   "description": "On Broadway in Times Square"}) is True)
check("broadway case-insensitive",
      is_broadway({"title": "BROADWAY show", "description": ""}) is True)
check("not broadway",
      is_broadway({"title": "Salsa Night", "description": "dancing"}) is False)

# --- filter_for_publish ---
# exact 4pm boundary: kept (rule excludes only ENDING BEFORE 4pm)
p, x = filter_for_publish([ev("e1", "T", [(WED, "8:30a–4p")])], TODAY)
check("4pm boundary kept", len(p) == 1 and len(p[0]["occurrences"]) == 1 and x == [])

# before-4pm weekday: dropped, event kept via its good occurrence
p, x = filter_for_publish(
    [ev("e2", "T", [(WED, "12:30–1:30pm"), ("2026-09-24", "6–7pm")])], TODAY)
check("12:30-1:30pm wed dropped",
      len(p) == 1 and len(p[0]["occurrences"]) == 1
      and p[0]["occurrences"][0]["start_date"] == "2026-09-24"
      and len(x) == 1 and x[0]["event_id"] == "e2"
      and x[0]["dropped"][0]["start_date"] == WED)

# 11am-noon wed: dropped
p, x = filter_for_publish([ev("e3", "T", [(WED, "11am-noon"),
                                          ("2026-09-24", "11am–7pm")])], TODAY)
check("11am-noon wed dropped",
      len(p[0]["occurrences"]) == 1 and len(x[0]["dropped"]) == 1)

# after-4pm weekday: kept
p, x = filter_for_publish([ev("e4", "T", [(WED, "2–8pm")])], TODAY)
check("2-8pm wed kept", len(p) == 1 and x == [])

# weekend daytime: kept
p, x = filter_for_publish([ev("e5", "T", [(SAT, "10am–2pm")])], TODAY)
check("10am-2pm sat kept", len(p) == 1 and x == [])

# Broadway exempt, title and description
p, x = filter_for_publish(
    [ev("e6", "Broadway Week", [(WED, "10am–2pm")])], TODAY)
check("broadway title exempt", len(p) == 1 and x == [])
p, x = filter_for_publish(
    [ev("e7", "Show", [(WED, "10am–2pm")], desc="on Broadway")], TODAY)
check("broadway description exempt", len(p) == 1 and x == [])

# single ambiguous time / unparseable: fail open, kept
p, x = filter_for_publish([ev("e8", "T", [(WED, "8pm")])], TODAY)
check("single 8pm kept", len(p) == 1 and x == [])
p, x = filter_for_publish([ev("e9", "T", [(WED, "evening")])], TODAY)
check("unparseable kept", len(p) == 1 and x == [])

# past violating occurrence: retained untouched
p, x = filter_for_publish([ev("e10", "T", [(PAST_WED, "10am–2pm")])], TODAY)
check("past violating retained",
      len(p) == 1 and len(p[0]["occurrences"]) == 1 and x == [])

# midnight crossover: mechanical drop
p, x = filter_for_publish(
    [ev("e11", "T", [(WED, "10pm–2am"), ("2026-09-24", "11am–7pm")])], TODAY)
check("10pm-2am wed dropped",
      len(p[0]["occurrences"]) == 1 and x[0]["dropped"][0]["times_text"] == "10pm–2am")

# midnight end: kept
p, x = filter_for_publish([ev("e12", "T", [(WED, "9am–midnight")])], TODAY)
check("9am-midnight wed kept", len(p) == 1 and x == [])

# event with only violating upcoming occurrences: omitted, listed with reason
p, x = filter_for_publish([ev("e13", "Only Bad", [(WED, "10am–2pm")])], TODAY)
check("all-violating event omitted",
      p == [] and len(x) == 1 and x[0]["event_id"] == "e13"
      and x[0]["reason"] == "no publishable occurrences"
      and x[0]["dropped"][0]["start_date"] == WED)

# payload does not mutate the input
src = [ev("e14", "T", [(WED, "10am–2pm"), ("2026-09-24", "6–7pm")])]
p, x = filter_for_publish(src, TODAY)
check("input not mutated", len(src[0]["occurrences"]) == 2)

# empty input
p, x = filter_for_publish([], TODAY)
check("empty input", p == [] and x == [])

# --- filter_for_publish: multi-day spans ---
# 2026-09-23 Wed, 24 Thu, 25 Fri, 26 Sat, 27 Sun, 28 Mon, 29 Tue.
# Spans are judged on the REMAINING span [max(start,today), end]:
# any weekend day in it -> attendable -> kept.
THU = "2026-09-24"
FRI = "2026-09-25"
SUN = "2026-09-27"
MON = "2026-09-28"
PAST_MON = "2026-09-21"
PAST_FRI2 = "2026-09-18"


def evs(eid, title, occs, desc=""):
    return {"id": eid, "title": title, "description": desc,
            "occurrences": [{"id": eid, "start_date": s, "end_date": e,
                             "times_text": t} for s, e, t in occs]}


# wed-sun span, early hours every day: kept (weekend in span)
p, x = filter_for_publish([evs("m1", "T", [(WED, SUN, "10am–2pm")])], TODAY)
check("wed-sun early span kept", len(p) == 1 and x == [])

# wed-fri span, early hours: dropped (all weekdays, ends before 4pm)
p, x = filter_for_publish([evs("m2", "T", [(WED, FRI, "10am–2pm")])], TODAY)
check("wed-fri early span dropped",
      p == [] and len(x) == 1 and x[0]["reason"] == "no publishable occurrences")

# wed-fri span, late hours: kept
p, x = filter_for_publish([evs("m3", "T", [(WED, FRI, "10am–8pm")])], TODAY)
check("wed-fri late span kept", len(p) == 1 and x == [])

# wed-fri span, unknown hours: fail open, kept
p, x = filter_for_publish([evs("m4", "T", [(WED, FRI, "daily")])], TODAY)
check("wed-fri unknown span kept", len(p) == 1 and x == [])

# sat-sun span: kept
p, x = filter_for_publish([evs("m5", "T", [(SAT, SUN, "10am–2pm")])], TODAY)
check("sat-sun span kept", len(p) == 1 and x == [])

# currently running mon-fri span, early hours: judged on remaining
# wed-fri -> dropped
p, x = filter_for_publish([evs("m6", "T", [(PAST_MON, FRI, "10am–2pm")])], TODAY)
check("running mon-fri early span dropped", p == [] and len(x) == 1)

# currently running mon-sun span, early hours: weekend remains -> kept
p, x = filter_for_publish([evs("m7", "T", [(PAST_MON, SUN, "10am–2pm")])], TODAY)
check("running mon-sun early span kept", len(p) == 1 and x == [])

# fully past multi-day span: retained untouched
p, x = filter_for_publish(
    [evs("m8", "T", [("2026-09-14", PAST_FRI2, "10am–2pm")])], TODAY)
check("fully past span retained",
      len(p) == 1 and len(p[0]["occurrences"]) == 1 and x == [])

# inverted span (end < start, bad data): treated as single day
p, x = filter_for_publish([evs("m9", "T", [(FRI, WED, "10am–2pm")])], TODAY)
check("inverted span treated as single day", p == [] and len(x) == 1)

# broadway multi-day span: exempt
p, x = filter_for_publish(
    [evs("m10", "Broadway Market", [(WED, FRI, "10am–2pm")])], TODAY)
check("broadway span exempt", len(p) == 1 and x == [])

# missing end_date behaves as a single day (old ev() helper)
p, x = filter_for_publish([ev("m11", "T", [(WED, "10am–2pm")])], TODAY)
check("missing end_date is single day",
      p == [] and x[0]["reason"] == "no publishable occurrences")

# unparseable start date: fail open
p, x = filter_for_publish(
    [evs("m12", "T", [("someday", FRI, "10am–2pm")])], TODAY)
check("bad start date fails open", len(p) == 1 and x == [])

# --- structured start_time/end_time ---
from publish_filter import parse_hhmm, occurrence_end_minutes

check("hhmm basic", parse_hhmm("16:00") == 960)
check("hhmm single digit hour", parse_hhmm("9:30") == 570)
check("hhmm rejects 24:00", parse_hhmm("24:00") is None)
check("hhmm rejects bad minute", parse_hhmm("9:60") is None)
check("hhmm rejects prose", parse_hhmm("evening") is None)
check("hhmm rejects None", parse_hhmm(None) is None)


def socc(d, times_text=None, start_time=None, end_time=None):
    o = {"id": "t", "start_date": d, "end_date": d}
    if times_text is not None:
        o["times_text"] = times_text
    if start_time is not None:
        o["start_time"] = start_time
    if end_time is not None:
        o["end_time"] = end_time
    return o


def soccev(eid, occs):
    return {"id": eid, "title": "T", "description": "",
            "occurrences": occs}


check("structured preferred over prose",
      occurrence_end_minutes(socc(WED, "11am–7pm", end_time="15:30")) == 930)
check("structured used when prose unparseable",
      occurrence_end_minutes(socc(WED, "Museum hours",
                                  end_time="15:30")) == 930)
check("invalid structured falls back to prose",
      occurrence_end_minutes(socc(WED, "11am–7pm",
                                  end_time="25:00")) == 1140)
check("both unknown -> None",
      occurrence_end_minutes(socc(WED, "Museum hours")) is None)

# end-to-end: weekday structured 3:30pm end -> dropped
p, x = filter_for_publish(
    [soccev("s1", [socc(WED, "Museum hours", end_time="15:30")])], TODAY)
check("structured early end drops weekday", p == [] and len(x) == 1)
check("excluded entry carries structured times",
      x[0]["dropped"][0]["end_time"] == "15:30")

# end-to-end: structured 4pm exactly -> kept (rule is end < 4pm)
p, x = filter_for_publish(
    [soccev("s2", [socc(WED, "Museum hours", end_time="16:00")])], TODAY)
check("structured 4pm exactly kept", len(p) == 1 and x == [])

# end-to-end: structured decides over conflicting prose
p, x = filter_for_publish(
    [soccev("s3", [socc(WED, "10am–2pm", end_time="18:00")])], TODAY)
check("structured overrides prose decision", len(p) == 1 and x == [])

# materialize-recurrence emits the rule's structured times
import importlib.util
_spec = importlib.util.spec_from_file_location(
    "materialize_recurrence",
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 "materialize-recurrence.py"))
mr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(mr)
import datetime as _dt
_rule = {"frequency": "weekly", "days_of_week": ["Wednesday"],
         "first_date": "2026-09-23", "last_date": "2026-09-30",
         "start_time": "16:00", "end_time": "17:30"}
_gen = mr.expand(_rule, _dt.date(2026, 9, 23))
check("generated occ carries structured times",
      _gen[0]["start_time"] == "16:00" and _gen[0]["end_time"] == "17:30"
      and _gen[0]["times_text"] == "Wed, Sep 23 · 4pm–5:30pm")
_rule2 = dict(_rule, overrides={"2026-09-23":
                                {"times_text": "Wed, Sep 23 · 6–8pm"}})
_gen2 = mr.expand(_rule2, _dt.date(2026, 9, 23))
check("times_text override drops structured times",
      "start_time" not in _gen2[0] and "end_time" not in _gen2[0]
      and _gen2[0]["times_text"] == "Wed, Sep 23 · 6–8pm")

print("\nAll publish_filter tests passed.")
