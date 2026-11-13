# Things To Do — Code Bundle

The working code for a "things to do" site and its morning curation
pipeline, packaged to install from — no rebuild from a specification.
Pair it with the Rebuild Kit document, which carries the routine, the
playbook template, and the onboarding: the kit explains *how the system
runs*; this bundle *is* the system. The kit lives in this same
repository at `docs/index.md`, published at
https://p-sun.github.io/personalized-event-curation-for-meta-muse/ —
start there: run its onboarding (Part F) before this install, because
the answers decide the playbook and the settings this install applies.

## Contents

- `app/` — the fullstack web app source: a TypeScript/React client on the
  Muse web-artifact runtime, server actions backed by SQLite (Drizzle
  migrations in `app/drizzle/`), Leaflet maps on OpenStreetMap tiles.
  `app/package.json` lists the dependencies; `bun.lock` pins them.
- `data/` — sample data in the exact production schema: five invented
  events and three venues in a fictional city (Riverton), a starter
  `state.json`, an empty `dropped-links.json` queue, and two sample
  Instagram sources. This data exists so the
  site renders end-to-end the moment it is installed, and so every later
  record has a shape to match.
- `scripts/` — the curation engine: the publish filter, duplicate and
  recurrence validators, the materializers, checkpointing, the retention
  prune, and `ig_pull.py` — one morning's Instagram pull kept as the
  reference implementation of the source adapter. The scripts' own tests
  are included (`test_*.py`).

Not included, by design: anyone's real dataset, accounts, or saved
collections; `node_modules` (install from `app/package.json`); the
runtime database (the app creates its own); the app icon (generate one
for your city); and — in the repository copy — seven binary library
asset files, restored from the npm dependencies at install (step 3).

## Install

1. Get the bundle. Clone the repository:
   `git clone https://github.com/p-sun/personalized-event-curation-for-meta-muse`
   — the repo root is the bundle root (`app/`, `data/`, `scripts/`,
   this file).
2. Hand `app/` to your Muse and ask it to create the fullstack web
   artifact from this source (its builder mints the artifact identity
   and installs dependencies from `app/package.json`; there is nothing
   to configure in the tree). One dependency is worth knowing about:
   `app/package.json` references the Muse runtime SDK by an absolute
   path (`file:/opt/hatch/…`) — the platform's own package inside your
   Muse environment; if dependency resolution ever fails, that path is
   the first place to look.
3. Restore the library assets. The repository stores text only, so seven
   binary asset files that ship inside the app's own npm dependencies
   are copied out of the installed tree, into the source, before the
   app is opened (if the client was already built, rebuild it after
   copying so the assets are picked up):
   - from `app/node_modules/leaflet/dist/images/`, copy `layers.png`,
     `layers-2x.png`, `marker-icon.png`, `marker-icon-2x.png`, and
     `marker-shadow.png` into `app/client/src/images/`;
   - from `app/node_modules/@fontsource-variable/inter/files/`, copy
     `inter-latin-wght-normal.woff2` into `app/client/src/assets/`;
   - from `app/node_modules/@fontsource-variable/sora/files/`, copy
     `sora-latin-wght-normal.woff2` into `app/client/src/assets/`.
   These are the libraries' own files, byte-identical to the ones the
   app ships with.
4. Rebase the sample dates: the sample occurrences sit in the week of
   Nov 14–21, 2026. Shift them onto the current week before loading, so
   the landing view (today) has events in it — keep each occurrence's
   dates and `times_text` consistent when you shift.
5. Load the sample data through the app's actions: `replace_locations`
   with the full set from `data/locations.json`, then `replace_events`
   with `data/events.json`. (The location action takes the complete set
   in one call; event records carry their `location_id`.)
6. Open the app and verify: the five Riverton events render in the feed
   and on the map, filters and the Settings view switcher work, and the
   sample event with `ig_mention_count: 3` shows its mentions pill.
7. Run the engine tests from inside `scripts/`:
   `python3 -m unittest test_publish_filter test_checkpoint test_materialize_structured_times`
   — they pass against the sample layout, where `scripts/` and `data/`
   are siblings.

## Make it yours

- Rename: the app name lives in `app/package.json` (`name`),
  `app/client/index.html` (`<title>`), and the header strings in
  `app/client/src/` — search the client source for the old name and
  replace each hit with your city's.
- Replace the sample data with your own first curated events, in the
  same shapes. Delete the Riverton records through the same actions
  (`delete_event`; locations are replaced wholesale).
- Set your Instagram account and collection IDs at the top of
  `scripts/ig_pull.py` (`YOUR_IG_USER_ID`, `YOUR_IG_COLLECTION_ID`), and
  your own username where `enrich-ig-sources.py` asks for it. The
  `TODAY` / `SINCE` constants at the top of `ig_pull.py` are per-run
  dates — set them fresh each run; they are not configuration.
- Write your playbook (sources, inclusions, exclusions) from the kit's
  Part E template, and schedule the morning run around the routine in
  Part C of the kit.
- Optional: the static build (a shareable frozen snapshot) is described
  in the kit — fullstack-only is the default.
