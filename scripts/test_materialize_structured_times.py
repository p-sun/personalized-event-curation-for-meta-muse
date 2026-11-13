#!/usr/bin/env python3
"""Tests for materialize-structured-times.py — plain asserts, run with:
python3 test_materialize_structured_times.py"""

import copy
import importlib.util
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

_spec = importlib.util.spec_from_file_location(
    "materialize_structured_times",
    os.path.join(os.path.dirname(os.path.abspath(__file__)),
                 "materialize-structured-times.py"))
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
materialize = _mod.materialize


def check(name, cond):
    assert cond, "FAILED: %s" % name
    print("ok: %s" % name)


def ev(occs):
    return {"id": "e1", "title": "T", "occurrences": occs}


def occ(times_text, **kw):
    o = {"start_date": "2026-09-24", "end_date": "2026-09-24",
         "times_text": times_text}
    o.update(kw)
    return o


# fills absent fields from an unambiguous range
events = [ev([occ("Thu, Sep 24 · 11am–7pm")])]
filled = materialize(events)
o = events[0]["occurrences"][0]
check("fills start/end from prose",
      o["start_time"] == "11:00" and o["end_time"] == "19:00"
      and filled == ["e1"])

# never overwrites an existing structured time (hand-set override wins)
events = [ev([occ("Thu, Sep 24 · 11am–7pm", start_time="10:00",
                  end_time="18:00")])]
filled = materialize(events)
o = events[0]["occurrences"][0]
check("never overwrites existing structured times",
      o["start_time"] == "10:00" and o["end_time"] == "18:00"
      and filled == [])

# skips generated occurrences (recurrence materializer owns them)
events = [ev([occ("Thu, Sep 24 · 4pm–5:30pm", generated=True)])]
filled = materialize(events)
o = events[0]["occurrences"][0]
check("skips generated occurrences",
      "start_time" not in o and "end_time" not in o and filled == [])

# multi-range prose (per-day hours) is left alone
events = [ev([occ("Sep 24: 1–8pm; Sep 25–27: 10am–8pm")])]
filled = materialize(events)
o = events[0]["occurrences"][0]
check("skips multi-range prose",
      "start_time" not in o and "end_time" not in o and filled == [])

# midnight end is unrepresentable as HH:MM
events = [ev([occ("9am–midnight")])]
filled = materialize(events)
o = events[0]["occurrences"][0]
check("skips midnight end",
      "start_time" not in o and "end_time" not in o and filled == [])

# range-less prose is left alone (filter fails open via prose fallback)
events = [ev([occ("Museum hours")])]
filled = materialize(events)
o = events[0]["occurrences"][0]
check("skips range-less prose",
      "start_time" not in o and "end_time" not in o and filled == [])

# bare-meridiem inheritance matches the filter's semantics
events = [ev([occ("6–7pm")])]
materialize(events)
o = events[0]["occurrences"][0]
check("bare start inherits pm",
      o["start_time"] == "18:00" and o["end_time"] == "19:00")

# idempotent: a second run changes nothing
events = [ev([occ("Thu, Sep 24 · 11am–7pm")])]
materialize(events)
second = materialize(events)
check("idempotent", second == [])

# does not mutate the event identity or other fields
events = [ev([occ("Thu, Sep 24 · 11am–7pm")])]
before = copy.deepcopy(events)
materialize(events)
check("only adds the two fields",
      set(events[0]["occurrences"][0]) - set(before[0]["occurrences"][0])
      == {"start_time", "end_time"})

# --unparsed: the agent's worklist (no usable end from either source)
import subprocess
import tempfile, json


def docc(d, times_text):
    return {"start_date": d, "end_date": d, "times_text": times_text}


with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
    json.dump([ev([docc("2026-09-24", "Museum hours"),
                   docc("2026-09-24", "11am–7pm"),
                   docc("2026-09-20", "Museum hours")])], f)
    tmp = f.name
r = subprocess.run(
    [sys.executable, "materialize-structured-times.py",
     "--unparsed", "--today", "2026-09-23", "--events", tmp],
    capture_output=True, text=True)
os.unlink(tmp)
check("unparsed lists only upcoming unusable occurrences",
      r.returncode == 0 and "Museum hours" in r.stdout
      and "11am–7pm" not in r.stdout
      and "(1 occurrence(s) with no usable end time)" in r.stdout)

print("\nAll materialize-structured-times tests passed.")
