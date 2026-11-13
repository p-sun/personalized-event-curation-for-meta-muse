# personalized-event-curation-for-meta-muse

Sharing my muse powered personalized event curation app so other people can install it on their own Meta Muse. Fully built in Meta Muse.

## What this is

The working code for a personal "things to do in [your city]" app — a map + feed web app and the morning curation pipeline that keeps it filled — packaged so your own Muse can install it directly instead of rebuilding it from a specification.

- `app/` — the fullstack web app: a TypeScript/React client on the Muse web-artifact runtime, server actions backed by SQLite, Leaflet maps on OpenStreetMap tiles.
- `data/` — sample data in the production schema: five invented events and three venues in a fictional city (Riverton), so the site renders the moment it is installed. Delete the samples once the install is verified; your dataset starts from there.
- `scripts/` — the curation engine: the publish filter, the duplicate and recurrence validators, the materializers, checkpointing, the retention prune, and an Instagram pull kept as the reference implementation of the collection adapter.
- `INSTALL.md` — the install steps, including restoring seven library asset files from the app's npm dependencies (this repo stores text only; those files ship inside the `leaflet` and `@fontsource-variable` packages and are copied out at install).

## Start here

Follow [INSTALL.md](INSTALL.md): clone this repo, hand `app/` to your Muse, load the sample data, verify the render. The full kit — the onboarding questions, the playbook template, the morning routine, the source-adapter contract — lives on the kit page: https://muse.ai/s/things-to-do-rebuild-kit-xlxw6wikxkxtxq5b/fRQmOKehIjjLu7EktO5T1xITJPV444fVBwt9MnBPEao

No real data is in here: no one's events, accounts, or source lists. The taste, the sources, and the city are yours to supply.
