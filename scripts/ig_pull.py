#!/usr/bin/env python3
"""Instagram pull — reference implementation: one morning's run of the
saved-collection + fanout adapter, kept as the template for the daily
pull. Set ACCOUNT / COLLECTION / WORK for your own setup before use.

RECOVERY NOTE — connector format change overnight (Nov 10 -> Nov 11):
- `saved-posts` now returns posts nested under `media` (author/caption/
  permalink/media_id/created_at) instead of the old flat shape. The
  simplify function below maps the new shape (with flat-shape fallback).
- `posts` (fanout) now returns URL-only records (format social_posts_v1):
  no media id, no caption. Fanout URLs are enriched per-URL with
  `hatch-zeitgeist --post-url <url> --raw`, which returns the numeric
  post_id, full caption, author, creation_time and thumbnail.
- Dedup for fanout URLs uses a historical URL->media_id map built from
  all prior ig-collection-new-*.json / ig-fanout-new-*.json files on disk:
  a URL seen before maps to its known media id (checked against
  state.json seen_posts); a URL never seen before is new by definition
  and gets enriched via zeitgeist.
- Stories URLs (/stories/<user>/<id>/) from `posts` are dropped.

1. Paginate saved-posts for collection YOUR_IG_COLLECTION_ID until ~50 posts.
2. Fan out to distinct posters from today's collection pull.
3. Dedupe against state.json seen_posts keys; enrich unseen fanout URLs
   via hatch-zeitgeist; write new unseen posts.
Stops immediately on auth errors, 429 rate limits, or privsep transport
failures (caller reports); fanout file is checkpointed every 10 accounts
so a partial pull survives (per 2026-10-19 incremental-persistence lesson).
"""
import json, os, subprocess, sys, time, glob
from collections import Counter

ACCOUNT = "YOUR_IG_USER_ID"
COLLECTION = "YOUR_IG_COLLECTION_ID"
WORK = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
TODAY = "2026-11-14"  # set per run
SINCE = "2026-10-31"  # set per run

class FatalError(Exception):
    pass

def run_cli(args):
    cmd = ["instagram-cli"] + args
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except Exception as e:
        print(f"CMD FAIL {args[:2]}...: {e}", file=sys.stderr)
        return None
    if p.returncode != 0:
        blob = (p.stderr + p.stdout)[:500]
        if "429" in blob or "rate" in blob.lower():
            raise FatalError(f"RATE LIMITED: {blob}")
        if "privsep" in blob.lower() or "transport failed" in blob.lower():
            raise FatalError(f"TRANSPORT FAILED: {blob}")
        if any(t in blob.lower() for t in ("auth", "unauthorized", "login", "token", "401", "403")):
            raise FatalError(f"AUTH ERROR: {blob}")
        print(f"CMD ERROR {' '.join(cmd[:4])}: exit {p.returncode}: {p.stderr[:300]}", file=sys.stderr)
        return None
    try:
        return json.loads(p.stdout)
    except Exception as e:
        print(f"JSON PARSE FAIL for {' '.join(cmd[:4])}: {e}", file=sys.stderr)
        return None

def simplify_collection_post(p):
    m = p.get("media") or {}
    author = m.get("author") or {}
    caption = m.get("caption")
    if isinstance(caption, dict):
        caption = caption.get("text")
    # New nested shape, with old flat-shape fallback.
    return {
        "post_id": m.get("media_id") or p.get("id"),
        "username": author.get("username") or (p.get("user") or {}).get("username"),
        "url": m.get("permalink") or p.get("permalink"),
        "created_at": m.get("created_at") or p.get("taken_at") or p.get("created_at") or None,
        "post_caption": caption,
        "thumbnail_url": p.get("thumbnail_url") or p.get("thumbnail_src") or None,
    }

# --- 1. Paginate saved-posts ---
collection_posts = []
after = None
while len(collection_posts) < 50:
    args = ["saved-posts", "--account-id", ACCOUNT, "--collection-id", COLLECTION, "--limit", "50"]
    if after:
        args += ["--after", after]
    resp = run_cli(args)
    if not resp:
        print("saved-posts call failed; stopping pagination", file=sys.stderr)
        break
    for p in resp.get("posts", []):
        collection_posts.append(simplify_collection_post(p))
    pi = resp.get("page_info", {})
    if pi.get("has_next_page") and pi.get("end_cursor"):
        after = pi["end_cursor"]
    else:
        break

print(f"collection posts pulled: {len(collection_posts)}", flush=True)
with open(f"{WORK}/ig-collection-new-{TODAY}.json", "w") as f:
    json.dump(collection_posts, f, indent=1)

# --- 2. Fanout targets ---
counts = Counter(p["username"] for p in collection_posts if p["username"])
usernames = [u for u, _ in counts.most_common()]
print(f"distinct collection posters today: {len(counts)}; fanning out to {len(usernames)} accounts", flush=True)

fanout_urls = []  # {url, username}
skipped_accounts = []
partial = False
fanout_path = f"{WORK}/ig-fanout-new-{TODAY}.json"
attempted = 0
for i, u in enumerate(usernames):
    try:
        resp = run_cli(["posts", "--account-id", ACCOUNT, "--username", u,
                        "--since", SINCE, "--limit", "20"])
    except FatalError as e:
        print(f"FATAL at account {i+1}/{len(usernames)} ({u}): {e} — persisting partial fanout", file=sys.stderr)
        partial = True
        break
    attempted += 1
    if not resp or "posts" not in resp:
        skipped_accounts.append(u)
        print(f"  skip {u} (error/no data)", file=sys.stderr)
        continue
    n = 0
    for p in resp.get("posts", []):
        url = p.get("url") or ""
        if not url or "/stories/" in url:
            continue
        fanout_urls.append({"url": url, "username": u})
        n += 1
    print(f"  [{i+1}/{len(usernames)}] {u}: {n} posts", flush=True)
    if attempted % 10 == 0:
        tmp = fanout_path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(fanout_urls, f, indent=1)
        os.replace(tmp, fanout_path)
        print(f"  checkpointed {len(fanout_urls)} fanout URLs after {attempted} accounts", flush=True)
    time.sleep(1)

print(f"total fanout URLs: {len(fanout_urls)} (partial={partial})", flush=True)
tmp = fanout_path + ".tmp"
with open(tmp, "w") as f:
    json.dump(fanout_urls, f, indent=1)
os.replace(tmp, fanout_path)
if partial:
    print(f"unattempted accounts: {len(usernames) - attempted}", flush=True)

# --- 3. Dedupe against state.json + historical URL map ---
state = json.load(open(f"{WORK}/state.json"))
seen = set(state.get("seen_posts", {}).keys())

def media_id(post_id):
    return str(post_id).split("_")[0] if post_id else None

# Historical URL -> media_id from every prior pull file on disk.
url_to_mid = {}
for path in sorted(glob.glob(f"{WORK}/ig-collection-new-*.json") + glob.glob(f"{WORK}/ig-fanout-new-*.json")):
    if TODAY in os.path.basename(path):
        continue
    try:
        recs = json.load(open(path))
    except Exception:
        continue
    for r in recs:
        url = r.get("url")
        pid = r.get("post_id") or r.get("media_id")
        if url and pid:
            url_to_mid.setdefault(url, media_id(pid))
print(f"historical URL->media_id map: {len(url_to_mid)} entries", flush=True)

def enrich_via_zeitgeist(url):
    """One hatch-zeitgeist call; returns a new-post-shaped dict or None."""
    try:
        p = subprocess.run(["/opt/hatch/bin/hatch-zeitgeist", "--post-url", url,
                            "--raw", "--no-save"],
                           capture_output=True, text=True, timeout=120)
    except Exception as e:
        print(f"  zeitgeist FAIL {url}: {e}", file=sys.stderr)
        return None
    if p.returncode != 0:
        print(f"  zeitgeist exit {p.returncode} for {url}: {(p.stderr or '')[:200]}", file=sys.stderr)
        return None
    try:
        d = json.loads(p.stdout)
    except Exception as e:
        print(f"  zeitgeist JSON FAIL {url}: {e}", file=sys.stderr)
        return None
    pid = d.get("post_id")
    if not pid:
        return None
    return {
        "post_id": str(pid),
        "media_id": media_id(pid),
        "username": d.get("author_handle"),
        "url": d.get("post_url") or url,
        "created_at": d.get("creation_time"),
        "post_caption": d.get("caption"),
        "thumbnail_url": d.get("thumbnail_url"),
    }

new_posts = []
seen_ids = set()
zg_calls = 0
zg_failed = 0

def add_post(rec):
    mid = rec.get("media_id")
    if not mid or mid in seen or mid in seen_ids:
        return False
    seen_ids.add(mid)
    new_posts.append(rec)
    return True

# Collection posts first (full records already).
for p in collection_posts:
    rec = {
        "post_id": p.get("post_id"),
        "media_id": media_id(p.get("post_id")),
        "username": p.get("username"),
        "url": p.get("url"),
        "created_at": p.get("created_at"),
        "post_caption": p.get("post_caption"),
        "thumbnail_url": p.get("thumbnail_url"),
    }
    add_post(rec)

# Fanout URLs: known media id + seen -> skip; otherwise enrich.
fanout_new_urls = 0
for fu in fanout_urls:
    url = fu["url"]
    mid = url_to_mid.get(url)
    if mid and mid in seen:
        continue
    if mid and mid in seen_ids:
        continue
    fanout_new_urls += 1
    zg_calls += 1
    rec = enrich_via_zeitgeist(url)
    if rec is None:
        zg_failed += 1
        continue
    rec["username"] = rec.get("username") or fu["username"]
    add_post(rec)
    time.sleep(0.3)

with open(f"{WORK}/new-posts-{TODAY}.json", "w") as f:
    json.dump(new_posts, f, indent=1)

print(f"NEW unseen posts: {len(new_posts)}", flush=True)
print(f"SUMMARY collection={len(collection_posts)} distinct_accounts={len(counts)} "
      f"fanout_attempted={attempted} fanout_skipped={len(skipped_accounts)} fanout_urls={len(fanout_urls)} "
      f"fanout_unseen_urls={fanout_new_urls} zeitgeist_calls={zg_calls} zeitgeist_failed={zg_failed} "
      f"new_unseen={len(new_posts)} partial={partial}")
if partial or (zg_calls and zg_failed > zg_calls // 2):
    sys.exit(9)
