# personalized-event-curation-for-meta-muse

**Want your own personal events app? You don't build or install anything yourself — your Muse agent does it for you.**

Give your Muse this link: **https://p-sun.github.io/personalized-event-curation-for-meta-muse/** — and ask it to build you an event curation app like this one. That page is written for your Muse: it walks your agent through installing the app in Meta Muse, asking you a few setup questions (your city, what kinds of events you love, what to always leave out), and setting up a morning routine that keeps the app filled.

After that, all you do is feed it. Save Instagram posts about events into a saved collection, or send your Muse links to posts and websites you already check — a one-off link is added directly, and for a site you check often, Muse sets up a small fetcher that watches it. Every morning, Muse finds the new posts and listings from your sources and adds the events to your app — each one with a map, a calendar, and directions to the venue.

**See it running:** the finished app, live on my own city — [NYC Things To Do](https://muse.ai/s/nyc-things-to-do-2-ec5xx6xubpxjrxw/Q09_-sx691X2iT4vGbamqRlNT4AJLFcgyQ8CsezsiGg). It is the public snapshot of the same code and pipeline in this repo, rebuilt and re-shared by hand each time I publish, so it shows a recent morning's data rather than this minute's. Open it to see exactly what you are getting — your Muse can compare its install against it screen by screen.

## What this is

The working code for a personal "things to do in [your city]" app — a map + feed web app and the morning curation pipeline that keeps it filled — packaged so your own Muse can install it directly instead of rebuilding it from a specification.

- `app/` — the fullstack web app: a TypeScript/React client on the Muse web-artifact runtime, server actions backed by SQLite, Leaflet maps on OpenStreetMap tiles.
- `data/` — sample data in the production schema: five invented events and three venues in a fictional city (Riverton), re-anchored to the install date by a script in `scripts/`, so the site renders with events on today whenever it is installed. The samples stay loaded while you adapt the app and are deleted when your first real events replace them.
- `scripts/` — the curation engine: the publish filter, the duplicate and recurrence validators, the materializers, checkpointing, the retention prune, a sample-data re-anchoring script, and an Instagram pull kept as the reference implementation of the collection adapter.
- `INSTALL.md` — the install steps, including restoring seven library asset files from the app's npm dependencies (this repo stores text only; those files ship inside the `leaflet` and `@fontsource-variable` packages and are copied out at install).
- `PLAYBOOK.md` — your playbook, blank as shipped: your city, taste, and sources, filled in with your Muse during setup and read by every morning run.

## Start here

1. Open your Muse and give it this link: https://p-sun.github.io/personalized-event-curation-for-meta-muse/
2. Tell it: "Build me an event curation app like this one." It will ask you a few questions, install the app from this repo, and set up your morning routine.
3. Start saving event posts on Instagram, or sending Muse links to websites you like — your app fills from there.

For the curious: the kit's source is [docs/index.md](docs/index.md) in this repo, published via GitHub Pages — the few lines of Jekyll front matter at its top are Pages machinery, not kit content. [INSTALL.md](INSTALL.md) has the file-level install steps your Muse follows.

No real data is in here: no one's events, accounts, or source lists. The taste, the sources, and the city are yours to supply.
