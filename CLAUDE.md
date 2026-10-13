# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for waste collection dates: a
Node.js service (Node 22+, ESM, no build step) in its own sandboxed Docker
container, talking to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).
The dates come from the Python library
[Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule)
(MIT, nearly 1,000 sources), pinned in the Dockerfile and run unchanged by
`python/bridge.py`, one short process per request. Cloud only.

A **calendar integration** (`type: "calendar"`, Gladys 5.2.0+): one calendar
per schedule for every user who enabled it in "My calendars", plus a
dashboard widget, scene triggers and actions. No devices: Gladys does not let
one manifest be both, and a second repository for a device variant was tried
and dropped (two store entries for one thing confused users).

## Commands

```bash
npm install
npm test                                  # node --test, never touches the network
node --test test/app.test.js              # one file
node --test --test-name-pattern "widget"  # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check
scripts/dev-setup.sh                      # pinned library + venv in .wcs/
docs/illustrations/render.sh              # widget illustrations (Chrome, ImageMagick, Pillow)
scripts/build-cover.sh                    # cover.jpg from cover.svg (Inkscape, ImageMagick)
```

## Architecture

```
index.js                     SDK wiring only: createApp(gladys, { bridge, store }) + connect
src/app.js                   every handler, the one-minute tick, the publications
src/bridge.js                spawns python/bridge.py: one process at a time, timeout, minimal env
python/bridge.py             fetch / search / version over stdin-stdout JSON; finds the source
                             from the town, maps the address onto its parameters, INSEE code
python/check_sources.py      smoke test: every bundled source imports (CI, wcs-update.yml)
src/config.js                config_schema -> slots (house, country, address, source, advanced
                             key=value arguments), renames
src/schedule.js              collections: window, renames, hidden types, next ones, type keys
src/store.js                 /data/state.json: raw dates per slot, errors, reminders fired
src/calendar.js              one calendar per slot and user, windows of 500 events
src/events.js                reminders (collection_tomorrow / waste_type_tomorrow / collection_today)
src/widgets.js               the `upcoming` widget (pure, reused by docs/illustrations/gen.mjs)
src/bins.js                  waste type -> family -> color and bin pictogram (pngjs)
src/i18n.js                  runtime texts in en / fr / de / es
src/time.js                  calendar dates in the timezone of the house (TZ)
.github/scripts/release.mjs  version, changelog, version files, PR title checks
```

## Rules

- **External ids are forever**: calendars `ext:<selector>:<user>:schedule-<slot>`,
  events `ext:<selector>:<user>:s<slot>:<date>:<typeKey>`. Config, action,
  widget, trigger, field, variable and output keys too.
- **Calendars**: pushed after each fetch that changed something and once a
  day (the window slides), at most 30 writes a minute; a calendar the user
  stopped synchronizing is skipped; removed schedules delete their calendars.
- **Scene events** on transitions only, flat scalar data; `fetch_failed`
  never after a refresh asked by a scene action (loop risk).
- **The engine**: never pass the Gladys token or anything from the config but
  the source, the country, the address and the advanced arguments to Python.
  The INSEE lookup (geo.api.gouv.fr) sends the town and the postcode, never
  the street. One process at a time (256 MB for
  Node and Python together). A new Python import of a source = a line in
  `python/requirements.txt` (the CI smoke test catches it).
- **Upstream library**: update it only through `wcs-update.yml` (version and
  archive checksum together in the Dockerfile).
- **The container rootfs is read-only**: the only writable folder is /data
  (state file, TMPDIR and HOME of Python).
- **Widget content**: after any change, run `docs/illustrations/render.sh` and
  look at the four images; card dates are `YYYY-MM-DDT00:00:00.000Z` (shown
  as a calendar day by the Gladys front).
- **The form**: no JSON for the user. The address fields are mapped onto the
  parameters of the source by exact names (`FIELD_PARAMS` in
  python/bridge.py, mirrored by `FIELD_MESSAGES` in src/app.js); a tie
  between sources is an `ambiguous` error listing them, never a guess. The
  schedule is named after its house (`location: true`, GET /house); `name_<n>`
  left the form but is still read.
- **User-facing text** exists in en, fr, de and es: manifest, `src/i18n.js`,
  `docs/*.md`, `README*.md`. `test/i18n.test.js` checks it. Use the words of
  the Gladys UI (Discover / Découverte / Entdecken / Descubrir…).
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, `package-lock.json` or the manifest, nor the `docker_image`
  tag.
- **Changelog**: Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Style**: Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network.

## Pitfalls

- The store refuses a manifest over 100 KB: the ~3,800 sources cannot be a
  select (that is why the source is found from the town). The countries of
  the three `country_<n>` selects must match `sources.json`
  (python/check_sources.py checks it in the CI and in wcs-update.yml).
- A card `date` other than midnight UTC is shown with a time by the Gladys
  front.
- Waste types have no identifier upstream: event ids use the type name.
- Running the validator of the Gladys core outside its repository creates a
  `gladys-development.duckdb` file in the current folder.
