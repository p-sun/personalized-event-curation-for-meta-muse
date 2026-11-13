#!/usr/bin/env python3
"""Enrich ig-sources.json with profile data for accounts missing it.

The fanout pull sometimes returns slim records (no follower_count /
verified). This fills the gaps via `instagram-cli user-profile`, one
call per unenriched account -- only accounts with a null follower_count
are looked up, so re-runs are cheap.

Usage: enrich-ig-sources.py [--in PATH] [--account USERNAME]
"""

import argparse
import json
import subprocess
import time

ACCOUNT_ID = "YOUR_IG_USER_ID"  # @YOUR_IG_USERNAME


def lookup(username):
    p = subprocess.run(
        ["instagram-cli", "user-profile", "--account-id", ACCOUNT_ID,
         "--username", "@" + username],
        capture_output=True, text=True, timeout=60)
    if p.returncode != 0:
        return None
    try:
        data = json.loads(p.stdout)
    except json.JSONDecodeError:
        return None
    profiles = data.get("profiles") or []
    if not profiles or profiles[0].get("error"):
        return None
    return profiles[0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", default="ig-sources.json")
    args = ap.parse_args()

    with open(args.inp) as f:
        sources = json.load(f)

    todo = [s for s in sources if s.get("follower_count") is None]
    print(f"{len(todo)}/{len(sources)} accounts need enrichment.")
    done, failed = 0, 0
    for s in todo:
        prof = lookup(s["username"])
        time.sleep(0.5)
        if prof is None:
            failed += 1
            print(f"  FAIL {s['username']}")
            continue
        if prof.get("follower_count") is not None:
            s["follower_count"] = prof["follower_count"]
        if prof.get("is_verified") is not None:
            s["verified"] = prof["is_verified"]
        if prof.get("user_id") and not s.get("user_id"):
            s["user_id"] = prof["user_id"]
        done += 1
        print(f"  ok {s['username']}: {s['follower_count']} followers")

    with open(args.inp, "w") as f:
        json.dump(sources, f, indent=2, ensure_ascii=False)
    print(f"enriched {done}, failed {failed}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
