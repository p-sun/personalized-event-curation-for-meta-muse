---
layout: default
title: Things To Do — Rebuild Kit
---

# Things To Do — Rebuild Kit

Build your own personal "things to do in [your city]" app — map, feed, and a morning curation routine that learns from your sources, not someone else's.

> **What you are holding.** Two things that work as one kit. (1) This document: the install, the data model, the curation engine, the source-adapter contract, a blank playbook, and a setup onboarding. (2) A code bundle — the working app and engine scripts — in the same public GitHub repository as this document: this file is `docs/index.md` in it, and the bundle is the rest of the repo. The app is installed from the code, not rebuilt from a specification. Give this whole document to your Muse and ask it to start with Part F.

> **What is not in here.** Anyone else's data. No real events, no account names, no source lists. The bundle's sample data is invented — five events in a fictional city — so the site renders the moment it is installed. Every personal choice is a blank your Muse fills in with you during onboarding. Your dataset starts with the samples, and they are deleted the moment the install is verified.

## How to use this kit — for the receiving Muse

You are setting up a personal local-events app and daily curation pipeline for your user, in their city. First run the onboarding in Part F and record the answers as a config file and a playbook (Part E). Complete the onboarding before installing. Then follow the build order in Part F. Throughout, keep the deterministic-engine principle: inclusion rules are decided in code, in one publish filter, and curation applies the playbook as written.

**Reading order — start here.** Work through the kit in this order, which is not the order the parts are printed in:

1. **Part F** — run the onboarding first.
2. **Part A** — install the app from the code bundle and verify it against the sample data.
3. **Part E** — write the playbook with the user from their answers.
4. **Parts C and D** — set up the curation engine and source adapters for the daily routine. Part B is the data reference throughout.

**Prerequisites — have these ready before onboarding:**

- A Muse setup that can build web apps and run scheduled daily jobs.
- An Instagram account, if the user wants the saved-collection adapter. This is optional — the other adapters work without it.
- The user's own authorisation sentence for the map's external requests. Onboarding's closing step (Part F) collects it; the build audit needs it in the user's own words.

---

## 1 · What this is

### Your city, your sources, refreshed every morning

The finished system has two halves that work as one. The app is a web app showing curated local events on a map and in a feed. The pipeline is a morning routine that pulls new candidates from sources you chose, curates each new item once, and publishes the result to the app.

Nothing about the system is tied to one city. The city lives in configuration — a map centre, a default zoom, and the sources in your playbook. Change those and the same code curates a different place.

### Where candidates come from

Your Instagram saved collection → Links you drop in chat → Local event-calendar sites → Local aggregator accounts

Every morning the pipeline looks only at what is new since yesterday. A post or listing that has already been processed is never curated twice, and an event that already exists gains new dates instead of a duplicate record. That discipline — each post once, each event once — is what keeps a daily routine trustworthy over months.

### What a morning looks like

1. **Pull.** New posts and listings arrive from your adapters (Part D).
2. **Curate.** Your Muse applies your playbook: the kinds of events you want, the exclusions you set, and the most specific dates each source states.
3. **Publish.** A single deterministic filter decides what appears, the app updates, and you get a short report: what was added, what was filtered out, what was pruned, and anything that failed.

> **The one idea to keep.** Judgment lives in two places only: curation (is this the kind of thing the user wants, and are its dates right?) and code (the publish filter and validators). If a rule matters, put it in code or in the playbook, where every morning run applies it the same way.

---

## Part A · Install the app — the code bundle

### You get the code

The bundle (the repository's contents) carries the whole system:

- `app/` — the fullstack web app source. **Reference stack:** a TypeScript/React client on the Muse web-artifact runtime; server actions backed by SQLite (Drizzle migrations included) behind a single data interface; maps in Leaflet on OpenStreetMap tiles.
- `data/` — sample data in the exact production schema: five invented events and three venues in a fictional city (Riverton — the same city as the example playbook in Part E), a starter `state.json`, and two sample Instagram sources.
- `scripts/` — the curation engine as working code: the publish filter, the duplicate and recurrence validators, the materializers, checkpointing, the retention prune, an Instagram pull kept as the reference implementation of the collection adapter, and the scripts' own tests.
- `INSTALL.md` — the bundle's own copy of these install steps.

The bundle ships the fullstack build. A static build — the same client over a baked-in JSON snapshot — is **OPTIONAL**, only if the user chose a shareable version during onboarding (Part F): the fullstack app has database access and live data, but it is private and cannot be given a public link; the static build is the only one that can be shared via a public link, and its data is a frozen snapshot that updates only when someone manually rebuilds and re-shares it. The client's data-adapter seam (a build-time flag in `app/client/src/buildMode.ts`) is where the static variant switches adapters.

### Get the bundle

Clone the repository: `git clone https://github.com/p-sun/personalized-event-curation-for-meta-muse`. The repo root is the bundle root — `app/`, `data/`, `scripts/`, `INSTALL.md`, and `docs/` (this document). Git verifies the content as it clones, so there is no checksum step. (If someone hands you the bundle as a zip file instead, its MD5 is printed wherever the zip was published — verify it before unzipping, and on a mismatch extract again rather than repairing bytes by hand.)

### Install

1. **Create the app.** Hand `app/` to your Muse and ask it to create the fullstack web artifact from this source. Its builder mints the artifact identity and installs dependencies from `app/package.json`; there is nothing to configure in the tree.
2. **Restore the library assets.** The repository stores text only, so seven binary asset files are copied out of the installed dependencies into the source (the bundle's `INSTALL.md`, step 3, lists them exactly): Leaflet's five marker/layer PNGs from `app/node_modules/leaflet/dist/images/` into `app/client/src/images/`, and the Inter and Sora font files from the `@fontsource-variable` packages into `app/client/src/assets/`. They are the libraries' own files, byte-identical to the ones the app ships with. If the client was already built, rebuild it after copying.
3. **Rebase the sample dates.** The sample occurrences sit in the week of Nov 14–21, 2026. Shift them onto the current week before loading, keeping each occurrence's dates and `times_text` consistent, so the landing view has events in it.
4. **Load the sample data** through the app's actions: `replace_locations` with the full set from `data/locations.json`, then `replace_events` with `data/events.json` (Part B has the contracts).
5. **Verify the render.** Open the app: the five Riverton events appear in the feed and on the map; the winter-market event shows its mentions pill (its sample `ig_mention_count` is 3); filters respond; the Settings view switcher moves between views A, B, and C.
6. **Run the tests.** The app's own suite (`bun test` in `app/`) and the engine tests (`python3 -m unittest`, from `scripts/`) pass against the bundle as shipped. The app tests encode the load-bearing behaviors below — run them again after any code change.

### Load-bearing behaviors — the code already does these; keep them working

Each of these was earned from a real production failure. The installed code implements all of them and its tests cover them; treat this list as the acceptance criteria for any change you make to the app.

- **Filters are session-only.** All filter state — date selection including calendar ranges, favorites-only, category selections, search, free-only — is built fresh on every load and discarded when the session ends. The preferences record persists settings (theme, debug mode, IG-mentions display, location/sort, chosen view) and the user's content state (favorite and hidden event IDs) — and nothing else. Restored filters silently decay into permanently empty views; that failure class is designed out, so keep filter state out of the record.
- **One selected event, by construction.** The shared map holds exactly one highlight state, and everything that displays the selection — the green highlight, the title bubble — derives from that single state. A tap writes the selection; it never decides what gets titled.
- **Landing default.** A fresh session opens unfiltered on a single-day view of today — or tomorrow when the local time is 20:00 or later. The wider ranges stay manual in-session choices.
- **Images.** Priority: the official image from the event's official site, then the source post's thumbnail, then an abstract placeholder. Write actions ingest a supplied `image_url` (Part B). Verify images in the rendered live page after a publish — real asset paths, photos visibly rendering — never from build output alone; if photos strand on a placeholder despite a clean build, see the appendix.
- **Display rules.** Multi-day events always show their full date range, start to end, on headlines, feed cards, and map cards. Cards link out to Instagram with an "Original post" deep link — the working form, since an in-app embed renders Instagram's broken-link screen without a session.
- **Views.** All three views (A feed + map, B details + minimap, C fullscreen map) read the same dataset, the same shared map component, and the same filter pipeline — a map feature built once, in the shared map, reaches every view. The view switcher lives in Settings; the app opens on A; the chosen view persists as a setting.
- **Preferences record.** One versioned local record, no migration path: a structurally unusable record is deleted and the app starts fresh from defaults; a missing setting picks up its default while the rest restore as saved.

> **Authorisation the build audit needs.** The app requests OpenStreetMap tiles for location-based map moves and links out to Google Maps for directions. During setup (Part F, closing step), ask the user to authorise those external requests in their own words and carry that sentence verbatim into the build request. A second-hand summary of permission is not accepted by the audit.

### Make it yours

- **Rename.** The app name lives in `app/package.json`, `app/client/index.html` (`<title>`), and the header strings in `app/client/src/` — search the client source for the old name and replace each hit with your city's.
- **Set the city.** The map's home centre and default zoom live in the client config; set them to your city, and write them into the playbook (Part E).
- **Clear the samples.** After verification, delete the five sample events (`delete_event`) and replace the sample locations with your first real venues. The `data/` files are now your canonical datasets — keep their shapes exactly.

---

## Part B · Data model and database

### JSON is the truth; the database is a synced copy

Datasets are plain JSON files — durable, auditable, and rebuildable. At publish, they sync into the runtime store (SQLite, behind server actions). If the two ever disagree, the JSON wins and the runtime is re-pushed. The bundle's `data/` files are these datasets, seeded with the samples.

#### events.json — one record per logical event

```json
{
  "id": "kebab-case-slug",
  "title": "...",
  "venue": "...",
  "address": "...",
  "lat": 0.0,
  "lng": 0.0,
  "location_id": "location:...",
  "category": "...",
  "description": "1-2 sentences",
  "price_text": "...",
  "is_free": true,
  "official_url": "https://... or null",
  "source_url": "permalink",
  "image_url": "https://... or null",
  "ig_mention_count": 0,
  "occurrences": [
    {
      "id": "...",
      "start_date": "YYYY-MM-DD",
      "end_date": "YYYY-MM-DD",
      "times_text": "Sat, Nov 14 · 11am-5pm",
      "start_time": "11:00",
      "end_time": "17:00"
    }
  ],
  "recurrence": "optional — see below"
}
```

A weekly series is one record with many occurrences — one record holds the whole series. A genuine multi-day run is one occurrence with a start and end range. Structured `start_time` / `end_time` ("HH:MM", 24-hour) are derived from `times_text` by the parser in Part C; they may be absent when the text cannot be parsed. An optional recurrence rule holds frequency, days of week, first date, last date (null if indefinite), and times; the materialiser alone owns the occurrences of a recurring event — it generates them, and changes to them go through the rule.

#### locations.json — one record per venue

```json
{
  "id": "location:<hex of venue name>",
  "name": "...",
  "addresses": ["..."],
  "lat": 0.0,
  "lng": 0.0,
  "website_url": "https://... or null"
}
```

Each event carries exactly one address and one `location_id`. If an event's address is at or near a location's addresses — same plaza, station, or complex — reuse that location and append the specific address if missing. One venue gets exactly one location record.

### State, sources, and runtime actions

#### The ledger that makes "once each" possible

#### state.json — every post, recorded exactly once

```json
{
  "seen_posts": {
    "<media_id>": {
      "events": ["event-id", "..."],
      "processed_at": "YYYY-MM-DD",
      "via": "...",
      "note": "..."
    }
  }
}
```

Every processed source post gets an entry — with an empty events list and a note when it produced no event. The mapping does double duty: it is both the dedup backbone ("each post once, each event once") and the source for mention counts. When a post mentions an already-curated event, map it to that event's ID even if it adds no new dates. When an event is merged, renamed, or deleted, repair its references in `state.json` in the same run.

#### ig-sources.json — what feeds the pipeline, in the open

```json
[
  { "username": "...", "user_id": "...", "profile_url": "https://www.instagram.com/.../",
    "follower_count": 0, "verified": false }
]
```

The accounts the pipeline fans out from. Rebuild it from scratch on every run from the pull itself — a pure projection of the pull — and surface it in the app's Settings so the user can always see what feeds their app. An account that leaves the collection drops out of the next rebuild on its own.

#### Runtime server actions

The bundle's `app/server/src/actions.ts` is the contract's source; the table is the summary the pipeline works to.

| Action | Contract |
|---|---|
| `list_events` / `list_locations` / `list_ig_sources` | Reads for the client. |
| `replace_events` | Upsert batch by ID. Validates that every `location_id` exists — push locations first. |
| `replace_locations` | Atomic full-set sync. It is delete + insert, so it must always carry the full set. |
| `update_event` | Scalar fields are safe. Passing `occurrences` replaces the whole array — it is not a merge. |
| `delete_event` / `set_ig_mention_counts` | Explicit removals; deterministic counts from `state.json`. |

Mutating actions are owner-only. Images: give a write action a remote `image_url` and it ingests the image — the action fetches the HTTPS URL server-side and stores it as an owned blob (key shape `events/<event-id>/cover-<hash>`), which `list_events` resolves for the client. Push records carry the canonical `image_url` whenever it is non-null. To preserve an event's existing image, omit the `image_url` field from the push — omission keeps the stored blob. Send an explicit `null` only to clear an image. A failed fetch leaves the event in place without an image and surfaces in the action's response (`image_status` / `image_warnings`), so the pipeline can report it and retry on a later run.

---

## Part C · The morning curation engine

### Thirteen steps, in this order, every morning

The deterministic steps run the bundle's `scripts/` as shipped; curation itself is the agent work between them.

1. **Pull the collection.** Paginate the user's Instagram saved collection; drop media IDs already in `state.json`.
2. **Fan out.** Pull the last two weeks of posts from each distinct poster in the collection, plus named aggregator accounts. Drop anything already seen.
3. **Run the website fetchers** (Part D) and collect their contract records.
4. **Run the rotating-venue search** (Part D, adapter 4), if the playbook names one.
5. **Curate the new items per the playbook:** hard filters, accurate dates — the most specific dates the source states win over any broader range it also mentions — and dedup by title + location and by overlapping dates.
6. **Merge with checkpointing.** Persist events, locations, and state atomically after each curation slice. A crashed run resumes without re-curating; skip slices whose posts are all already in state.
7. **Materialise.** Expand recurrence rules (~60 days out); derive structured times from `times_text` with a strict deterministic parser (fills absent fields only); dedupe contained occurrences; recompute mention counts from `state.json`.
8. **Validate.** No duplicate events, no dangling state references. Any failure stops the run before publish.
9. **Prune** by the retention rule (see "The rules that keep the engine honest" below).
10. **Build the publish payload** with the publish filter — the only place inclusion is decided.
11. **Push:** locations first, then events; `delete_event` for pruned IDs. Send the location-replace action the full location set in one call (Part B), and build each `update_event` occurrences payload as the event's complete array — the update writes the array wholesale.
12. **Verify:** payload ID set equals runtime ID set, plus a field-level readback diff. A successful action response validates the schema, not the data — the readback diff is what closes the push.
13. **Report:** added and corrected, newly excluded by the filter, pruned, and every source that failed.

### The rules that keep the engine honest

#### When sources conflict — authority ranks

When sources disagree about dates, times, venue, or price, authority ranks:

1. The venue's or organizer's official page.
2. The organizer's own post.
3. Aggregator and roundup reposts.

Take the facts from the highest authority available. When sources conflict, publish the highest-authority fact and record the conflict in the `state.json` note for that post. If only an aggregator states a fact and that fact decides inclusion, verify it against a higher authority when one is reachable before publishing.

#### One filter, one retention rule, no improvisation

#### The publish filter decides inclusion — once

The publish filter (`scripts/publish_filter.py`) is the only place inclusion rules are decided — for example, a weekday-daytime cutoff based on an occurrence's end time. The filter applies them at publish time. Curation's duty is narrower and more important: an accurate `times_text` on every occurrence, so the filter has true data to decide on. Events that violate the filter stay in `events.json`; they are simply excluded from the payload. Unknown end times fail open — the occurrence is kept.

#### Derived times and contained occurrences

- The time parser is strict on purpose: no fuzzy matching, no spelling correction, no guessing. What it cannot parse stays unparsed and appears on a worklist (`--unparsed`). Fix a typo in `times_text`; fix the parser — with a test — for a legitimate format it should handle. One parser serves both the materialiser and the filter.
- When a new date falls inside an existing spanning occurrence, fold it into the span: enrich the span's `times_text` with any hours the single day carries, and skip the append — a dedupe step would otherwise delete the only copy of those hours.
- Mention counts are recomputed deterministically from `state.json` mappings on every run, so re-runs never inflate them.

#### Retention — a parameter, default two months

**Rule.** Delete an event when its last occurrence's `end_date` is strictly before today minus the retention window. Ending exactly on the boundary is kept. Pruning removes the event from the JSON, repairs its `state.json` references, and deletes it from the runtime in the same run. Occurrences of retained events are kept. The prune runs after recurrence materialisation, so a live recurring event — whose occurrences extend weeks ahead — is never pruned.

#### Discipline when sources push back

- **Rate limit (HTTP 429):** hard stop for that source, for that run. No retry, no alternate route. Unattempted sources roll to the next run and the report states that coverage was partial.
- **Fetcher failure:** a fetcher exiting non-zero means its site changed — follow the repair protocol in Part D.
- **Persistence:** write incrementally where a long pull could lose work — a run that dies halfway should not discard everything it already gathered.

---

## Part D · Source adapters and the record contract

### Every source speaks one contract

This is the per-person part. The engine never changes per source because every adapter emits records in exactly one of two shapes.

| Record | When | Engine does |
|---|---|---|
| Full record | The title is new to `events.json` | Sends it to curation with every field the source can supply |
| Slim record | The title already exists | Appends new occurrences only — no re-fetch, no re-curation |

```text
Slim:
{
  "already_curated": true,
  "event_id": "...",
  "occurrences": [ /* new dates only */ ]
}

Full:
title, venue, address, dates, times_text,
description, price, official_url, image
```

### The five adapters to build

1. **Instagram collection pull.** Part C, steps 1–2. Configured with the user's own account and collection name. Posters are discovered from the collection itself; aggregators the user names are added to the fanout. The bundle's `scripts/ig_pull.py` is a working reference implementation of this adapter — set its account and collection constants to the user's and adapt from there.
2. **Dropped links.** Whenever the user pastes a post or event link in chat, queue it as a source post and run it through the same curation path, with the same `state.json` recording. It is an input channel, not a scraper — make it explicit in the routine so links are never handled ad hoc.
3. **Website fetchers.** One script per event-calendar website the user names. How to build one is in "Building a website fetcher" below.
4. **Rotating-venue search.** For a venue that hosts one pop-up or exhibition at a time: search social and web for its current and next event until the next ~10 days are covered, then stop. Record processed post URLs in `state.json`.
5. **Aggregator accounts.** Local round-up accounts the user names. Include them in the fanout and in `ig-sources.json`.

### Building a website fetcher

#### From a calendar URL to a contract record

Scrapers are the fragile layer of the whole system — a site redesign breaks its fetcher and nothing else. Build each one the same way so breakage is loud and repair is routine.

1. **Inspect the listing first.** Open the site and find its structure. Prefer the site's own JSON or feed endpoints when they exist; fall back to the rendered listing.
2. **Check titles before details.** Compare listing titles against `events.json` before fetching any detail page. Known titles become slim records; only new titles cost a detail fetch.
3. **Skip the past mechanically.** The fetcher drops past dates itself and emits accurate `times_text` for everything else. It never applies inclusion rules — the publish filter decides those, once.
4. **Respect source quirks explicitly.** If a site flags cancellations, drop cancelled items in the fetcher. If a site can list stale entries, filter to upcoming dates in the fetcher and say so in a comment.
5. **Fail loudly.** On any structural surprise — missing listing, changed markup, empty parse — exit non-zero. Silence is the worst outcome: the failure protocol (Part C) only fires when the script admits it broke.
6. **Register it.** Add the fetcher to the run order with its file name, so every morning runs the same set in the same order.

> **Repair protocol, inherited verbatim.** Non-zero exit → read the site in the browser for that morning's candidates → note in the report that the script needs repair → repair the script against the new structure and re-test it before the next run. A source still broken on the second morning leads the report until it is repaired.

#### What transfers, what does not

- **Transfers as-is.** The bundle: the app code, the engine scripts, the schemas, the adapter contract, the playbook structure, this repair protocol. None of it knows or cares which city it serves.
- **Yours to supply.** Your collection, your aggregators, your calendar sites, your rotating venues, your taste rules. Supplied once, in onboarding — then written into the playbook, not re-asked each morning.

---

## Part E · Playbook template

### The file your Muse writes with you

Create this playbook from the onboarding answers and treat it as the single home for taste and sources. The engine reads it; mornings follow it. Fill every bracket — an empty bracket is an unmade decision.

```text
City
  [city and area, map centre coordinates, default zoom]

Views
  All three views ship (A, B, C); the switcher lives in Settings
   and the app opens on A by default [fixed — not a choice]

Sharing
  [fullstack only / fullstack + static public build]

Inclusion rules
  [kinds of events wanted — for example: free events and pop-ups;
   special, dated things only]

Exclusions
  [for example: concerts, children's programming, online-only,
   generic recurring listings]

Weekday daytime rule
  [on or off, cutoff time, end-time based, enforced only by the
   publish filter]

Retention window
  [default 2 months]

Run time
  [local time and timezone]

Image priority
  [official site, then source thumbnail, then placeholder
   (fixed; note any exception here)]

Sources
  [Instagram collection name; aggregator accounts; fetcher sites
   with script names; rotating venues]

Report format
  [what the morning message must include (start from Part C, step 13)]
```

### Example playbook — filled, for a fictional city

The example below is fictional. Imitate its shape, register, and completeness — not its content. Every name, handle, and source in it is a placeholder. Riverton is also the bundle's sample city: the five sample events in `data/` are this playbook's first week, so the install verification (Part A) renders exactly what this playbook describes.

```text
City
  Riverton — downtown and the riverfront districts;
  map centre 40.758, -73.9855 (stand-in coordinates — Riverton is
  plotted in Manhattan, matching the app's shipped map anchor, so the
  sample map framing works as-is; the bundle's sample data uses them;
  replace with yours); default zoom 13

Views
  All three views (A, B, C); switcher in Settings; opens on A by default

Sharing
  Fullstack only to start; add the static public build later if sharing is wanted

Inclusion rules
  Free events and pop-up shops; one-off exhibitions, markets, and
  sample sales; special, dated things only

Exclusions
  Concerts; children's programming; online-only sales and deals;
  generic recurring listings with no special date

Weekday daytime rule
  On; weekday occurrences ending before 4:00pm are excluded;
  end-time based; enforced only by the publish filter

Retention window
  2 months

Run time
  7:30am local time, America/Example (placeholder timezone)

Image priority
  Official site, then source thumbnail, then placeholder (fixed; no exception)

Sources
  Instagram collection: "Riverton Things to do";
  aggregator accounts: @example-riverton-roundup, @example-riverton-weekend (placeholder handles);
  fetcher sites: Example Downtown Association calendar (fetch-downtown.py),
  Example What's On Riverton (fetch-whatson.py) (placeholder sites and scripts);
  rotating venues: Example Project Space (placeholder venue)

Report format
  Added and corrected; newly excluded by the filter; pruned;
  every source that failed, with partial coverage stated plainly
```

---

## Part F · Onboarding — for the receiving Muse

### Getting set up — a few free-form questions. Then build.

This is onboarding, not an interview: you are setting the user up, not testing or grilling them. Welcome them, ask these questions conversationally, and explain how things work as you go — the Instagram note in question 5 is the model: teach the mechanism, don't just ask about it. Most things have sensible defaults, so follow up only where an answer is too vague to build from, and use the kit's defaults for anything the user doesn't care about. Write the answers into the playbook (Part E) and the app config as you go, and do not start building until you have enough to fill the playbook.

1. **Where?** What city and area should this cover?
2. **What do you want to find?** What kinds of things would you love to hear about?
3. **What do you never want?** What should this always leave out?
4. **Where do you hear about things now?** What sites, accounts, newsletters, or places do you already check?
5. **Instagram?** Do you use Instagram to find things to do — and would you like to feed this from there?
   > Teach this, don't just ask: you can keep an Instagram saved collection for this — whenever you see a post about an event you might want to go to, save it into a collection (call it "Things to do", for example). Each morning, the curation pulls new saves from that collection. If you don't have a collection like that, Muse can create a "things to do" collection for you, if you want. The morning curation doesn't just pull the collection, either — it also watches the accounts whose posts land in it for new events, so things can surface even when you haven't saved them yourself.
6. **Mornings?** When should the morning curation run, and what would you like the morning message to look like?
7. **Do you want a shareable version?** The fullstack app has database access and live data updated every morning, but it is private; the static build is the only one that can be shared via a public link, and it is a frozen snapshot that only updates when someone manually rebuilds and re-shares it.


**Closing step, before building.** Ask the user to authorise the map's external requests in their own words — the app loads OpenStreetMap tiles for location-based map moves and links directions out to Google Maps over plain HTTPS — and carry that sentence verbatim into the build request. A second-hand summary is not accepted by the audit.

### Build order and first run

#### Seven steps from onboarding to a daily routine

1. **Install the bundle and verify it.** Follow Part A: clone the repo, create the app from `app/`, restore the library assets, rebase the sample dates, load the sample data, and confirm the five Riverton events render. Run both test suites. The install is the foundation — every later step assumes it passed.
2. **Write the playbook and claim the datasets.** Fill the Part E playbook from the onboarding answers. Then delete the sample events and locations through the actions (`delete_event`; locations are replaced wholesale): the bundle's `data/` files are now the user's canonical datasets, empty and correctly shaped, and `scripts/` runs against them as-is.
3. **Adapt the app.** Rename it to the user's city (Part A), set the map's home centre and default zoom, and pick a theme. Run the app tests again after any code change.
4. **Build adapters one at a time** — the collection pull first (adapt `scripts/ig_pull.py` with the user's account and collection IDs), then each website fetcher — testing each against its live source and against the record contract before registering it in the run order.
5. **Run the first curation supervised.** Run the full engine with the user watching the report. Fix what is wrong in the playbook or the publish filter — fixes live in those two places, so every later run inherits them.
6. **Schedule the daily run** at the chosen local time, following the Part C run order exactly.
7. **Static build — only if chosen.** Only if the user chose the static build during onboarding, create it from the same client (the data-adapter seam in Part A), share a public link, and keep publishing manual-only; skip this step entirely otherwise. After sharing, run the rendered-page image verification from Part A before calling it done.

#### Definition of done

A build step is not done until its closing check passes:

- **Install:** all five sample events render in the feed and on the map with the sample data loaded; the mentions pill shows on the winter-market event; both test suites (app and engine) pass.
- **Playbook and datasets:** every playbook field is filled from onboarding — no empty brackets remain — and the sample records are deleted, leaving the four JSON datasets present, correctly shaped, and empty of samples.
- **Adapters:** each adapter has been tested against its live source and emits records that match the contract in Part D.
- **First curation:** the first push closes only when the payload ID set equals the runtime ID set and the field-level readback diff is clean.
- **Daily run:** the schedule fires at the chosen local time and follows the Part C run order exactly.
- **Static build (only if chosen):** it is done only after the rendered-page image verification passes — photos visibly render in the live shared page, not just in build output.

> **You get the machine, not anyone's data.** The samples are scaffolding: your dataset starts empty of real events and fills with your city's, from your own sources, starting the first morning you run it. That is the point of the kit: the app, the engine, and the discipline transfer — the taste, the sources, and the city are yours.

---

## Appendix — platform failure modes

Consult this appendix when the symptoms appear. These are failure modes observed on the hosting platform, not steps in the normal build.

### Images stranded on a placeholder

On the static build, the hosting runtime intercepts normal image assignment through an attribute tunnel: it installs a 1×1 transparent placeholder and swaps in the real image only after an asynchronous tunnel fetch resolves — a fetch that may never complete for asset paths. Cards then sit on the placeholder while automated checks report success, because the placeholder itself loads.

The bypass is a native computed-property assignment through a ref — `el["src"] = url`, guarded by a `getAttribute` check — instead of the framework's `src` prop, in the shared image component so both builds inherit it. The bundle's image component already carries the bypass; keep it intact through any adaptation.

A minifier can undo the bypass by normalising the computed-property write back to a plain assignment in the bundled output. After every build, check the final minified bundle still contains the guarded computed-property write; source fidelity does not imply bundle fidelity.

**Quick reference** — bundle: `git clone https://github.com/p-sun/personalized-event-curation-for-meta-muse` · files: `events.json` · `locations.json` · `state.json` · `ig-sources.json` · playbook · publish filter · fetchers. Principles: JSON is truth · each post once, each event once · rules in code, judgment in curation · verify in the rendered page, not the bundle.
