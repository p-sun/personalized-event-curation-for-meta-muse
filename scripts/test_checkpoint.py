#!/usr/bin/env python3
"""Test per-post checkpointing: a run that crashes after slice 1, then
resumes, must produce byte-identical datasets to an uninterrupted run,
and the resumed run must skip the already-checkpointed slices."""
import copy
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import checkpoint

WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
TODAY = "2026-10-03"


def make_fixtures():
    events = [{
        "id": "existing-event", "title": "Existing", "location_id": "location:abcd",
        "occurrences": [{"id": "existing-event", "start_date": "2026-10-05",
                         "end_date": "2026-10-05", "times_text": "x"}],
    }]
    locations = [{"id": "location:abcd", "name": "There",
                  "addresses": ["1 Main St"], "website_url": None}]
    state = {"note": "test", "seen_posts": {}}
    slices = []
    for i in range(3):
        slices.append({
            "new_events": [{
                "id": f"slice{i}-event", "title": f"Slice {i}",
                "location_id": f"location:slice{i}",
                "occurrences": [{"id": f"slice{i}-event", "start_date": "2026-10-10",
                                 "end_date": "2026-10-10", "times_text": "y"}],
            }],
            "new_locations": [{"id": f"location:slice{i}", "name": f"Place {i}",
                               "addresses": [f"{i} Main St"], "website_url": None}],
            "state_updates": {f"media-{i}a": [f"slice{i}-event"],
                              f"media-{i}b": []},
        })
    # slice 2 duplicates slice 0's event (cross-slice dup -> must be skipped)
    slices[2]["new_events"].append(copy.deepcopy(slices[0]["new_events"][0]))
    return events, locations, state, slices


def run_merge(workdir, slices, crash_after=None):
    """Simulate the daily merge. crash_after=N raises after checkpointing
    slice N (mid-run stall). Returns the report lines."""
    events = checkpoint.load_json(os.path.join(workdir, "events.json"))
    locations = checkpoint.load_json(os.path.join(workdir, "locations.json"))
    state = checkpoint.load_json(os.path.join(workdir, "state.json"))
    report = []
    for i, s in enumerate(slices):
        if checkpoint.slice_done(state, s["state_updates"]):
            report.append(f"slice {i}: already checkpointed, skipped")
            continue
        checkpoint.checkpoint_slice(
            workdir, events, locations, state,
            copy.deepcopy(s["new_events"]), copy.deepcopy(s["new_locations"]),
            s["state_updates"], TODAY, report)
        if crash_after is not None and i == crash_after:
            raise RuntimeError("simulated mid-run stall")
    # appends phase: idempotent occurrence append, then final persist
    for e in events:
        if e["id"] == "existing-event":
            if not any(o["id"] == "existing-event-2026-10-06" for o in e["occurrences"]):
                e["occurrences"].append({"id": "existing-event-2026-10-06",
                                        "start_date": "2026-10-06",
                                        "end_date": "2026-10-06",
                                        "times_text": "z"})
    checkpoint.save_all(workdir, events, locations, state)
    report.append("appends persisted")
    return report


def snapshot(workdir):
    return {n: checkpoint.load_json(os.path.join(workdir, n))
            for n in ("events.json", "locations.json", "state.json")}


def main():
    events, locations, state, slices = make_fixtures()

    # Run A: uninterrupted
    dir_a = tempfile.mkdtemp(prefix="ckpt-a-")
    for name, obj in (("events.json", events), ("locations.json", locations),
                      ("state.json", state)):
        checkpoint.atomic_write_json(os.path.join(dir_a, name), copy.deepcopy(obj))
    report_a = run_merge(dir_a, slices)
    snap_a = snapshot(dir_a)

    # Run B: crash after slice 1, then resume from disk
    dir_b = tempfile.mkdtemp(prefix="ckpt-b-")
    for name, obj in (("events.json", events), ("locations.json", locations),
                      ("state.json", state)):
        checkpoint.atomic_write_json(os.path.join(dir_b, name), copy.deepcopy(obj))
    try:
        run_merge(dir_b, slices, crash_after=1)
        print("FAIL: expected simulated crash")
        return 1
    except RuntimeError as e:
        assert "simulated" in str(e)
    report_b = run_merge(dir_b, slices)  # resume
    snap_b = snapshot(dir_b)

    # 1. Resumed run skipped checkpointed slices
    assert any("slice 0: already checkpointed, skipped" in r for r in report_b), report_b
    assert any("slice 1: already checkpointed, skipped" in r for r in report_b), report_b
    assert not any("already checkpointed" in r for r in report_a), report_a

    # 2. Final datasets identical
    for name in ("events.json", "locations.json", "state.json"):
        a = json.dumps(snap_a[name], sort_keys=True)
        b = json.dumps(snap_b[name], sort_keys=True)
        assert a == b, f"{name} differs between clean and resumed runs"

    # 3. All posts checkpointed exactly once; cross-slice dup dropped
    sp = snap_b["state.json"]["seen_posts"]
    assert len(sp) == 6, sp
    ids = [e["id"] for e in snap_b["events.json"]]
    assert sorted(ids) == ["existing-event", "slice0-event", "slice1-event", "slice2-event"], ids
    occ = [o["id"] for e in snap_b["events.json"] if e["id"] == "existing-event"
           for o in e["occurrences"]]
    assert occ.count("existing-event-2026-10-06") == 1, occ  # append idempotent

    shutil.rmtree(dir_a)
    shutil.rmtree(dir_b)
    print("checkpoint test OK: resume skips checkpointed slices, "
          "final datasets identical, appends idempotent")


if __name__ == "__main__":
    main()
