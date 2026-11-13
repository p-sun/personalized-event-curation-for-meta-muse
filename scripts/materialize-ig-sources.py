#!/usr/bin/env python3
"""Materialize the IG sources list into ig-sources.json.

"All our IG sources" = every Instagram account the pipeline fans out
from: the union of the distinct poster accounts in the latest collection
pages and the distinct author accounts in the latest fanout pull.

The file is rebuilt from scratch every run -- a derived projection of
the pipeline inputs, not a maintained list. If an account leaves the
collection, it drops out of the next rebuild on its own. Nothing is ever
hand-edited here (same rule as ig_mention_count), so the list cannot
drift from the pipeline data.

Enrichment comes from the fanout records (follower_count, verified,
profile_url); collection-only accounts get id + username only.
profile_pic CDN URLs are expiring links and are deliberately not stored.

Run after the fanout pull, before publish.

Usage: materialize-ig-sources.py [--pages GLOB] [--fanout GLOB] [--out PATH]
Defaults pick the latest-dated ig-collection-pages-*.json and
ig-fanout-new-*.json in the working directory.
"""

import argparse
import glob
import json
import os


def latest(pattern):
    files = sorted(glob.glob(pattern), key=os.path.getmtime)
    if not files:
        raise SystemExit(f"no files match {pattern}")
    return files[-1]


def latest_pages():
    """Newest collection snapshot: ig-collection-new-*.json (flat simplified
    posts, written by the current pull script) preferred when newer than the
    legacy ig-collection-pages-*.json page format."""
    cands = glob.glob("ig-collection-pages-*.json") + glob.glob("ig-collection-new-*.json")
    if not cands:
        raise SystemExit("no collection snapshot files match")
    return sorted(cands, key=os.path.getmtime)[-1]


def iter_collection_users(data):
    """Yield (username, user_id) from either snapshot format:
    legacy pages [{posts: [{user: {username, id}}]}] or flat simplified
    [{username, post_id, ...}]."""
    if isinstance(data, list) and data and isinstance(data[0], dict) and "posts" in data[0]:
        for pg in data:
            for p in pg.get("posts", []):
                u = p.get("user") or {}
                if u.get("username"):
                    yield u.get("username"), u.get("id")
    elif isinstance(data, list):
        for p in data:
            if isinstance(p, dict) and p.get("username"):
                yield p.get("username"), None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", default=None)
    ap.add_argument("--fanout", default=None)
    ap.add_argument("--out", default="ig-sources.json")
    args = ap.parse_args()

    pages_path = args.pages or latest_pages()
    fanout_path = args.fanout or latest("ig-fanout-new-*.json")

    with open(pages_path) as f:
        pages = json.load(f)
    with open(fanout_path) as f:
        fanout = json.load(f)

    sources = {}  # username -> record

    def new_record(name):
        return {
            "username": name,
            "user_id": None,
            # Canonical profile URL; fanout records sometimes carry the
            # /_u/ redirect form, which we don't want to persist.
            "profile_url": f"https://www.instagram.com/{name}/",
            "follower_count": None,
            "verified": None,
        }

    for name, uid in iter_collection_users(pages):
        if not name or name in sources:
            continue
        rec = new_record(name)
        rec["user_id"] = uid
        sources[name] = rec

    for r in fanout:
        name = r.get("username") or r.get("author_username")
        if not name:
            continue
        rec = sources.setdefault(name, new_record(name))
        if r.get("author_id") and not rec["user_id"]:
            rec["user_id"] = r.get("author_id")
        if r.get("follower_count") is not None:
            rec["follower_count"] = r["follower_count"]
        if r.get("verified") is not None:
            rec["verified"] = r["verified"]

    out = sorted(sources.values(), key=lambda s: s["username"].lower())
    with open(args.out, "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    enriched = sum(1 for s in out if s["follower_count"] is not None)
    print(f"ig sources materialized: {len(out)} accounts "
          f"({enriched} with follower counts) "
          f"from {os.path.basename(pages_path)} + {os.path.basename(fanout_path)}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
