# Waste Collection Schedule for Gladys Assistant

**English** | [Français](README.fr.md) | [Deutsch](README.de.md) | [Español](README.es.md)

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/William-De71/gladys-waste-collection-schedule?sort=semver)](https://github.com/William-De71/gladys-waste-collection-schedule/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/William-De71/gladys-waste-collection-schedule/release.yml?branch=main&label=CI)](https://github.com/William-De71/gladys-waste-collection-schedule/actions/workflows/release.yml)
[![Gladys](https://img.shields.io/badge/Gladys-%E2%89%A5%205.1.1-2f6fb5)](https://gladysassistant.com)

![Waste Collection Schedule for Gladys Assistant](cover.jpg)

The waste collection dates of your address in Gladys Assistant, from the nearly 1,000 sources of [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule) (towns, waste operators, apps and ICS calendar links of about thirty countries). Devices, a reminder the evening before, a dashboard widget and, in its calendar variant, the collections in the Gladys calendar.

## Features

- **Nearly 1,000 sources**: the Waste Collection Schedule library itself (MIT), bundled and pinned in the image, updated by a weekly workflow. Any ICS calendar link works too.
- **Up to three schedules** (a second home, or a second source for the same address).
- **Devices**: days until the next collection, its waste types, and days until the next collection of each waste type.
- **Calendar variant** ([Waste Collection Calendar](https://github.com/William-De71/gladys-waste-collection-calendar), same image): one calendar per schedule for each user who enables it.
- **Dashboard widget** "Upcoming collections", with a bin of the right color per collection day.
- **Scene triggers**: collection tomorrow (evening reminder), waste type collected tomorrow, collection today (morning reminder), update failed.
- **Scene actions**: get the next collection (optionally of one waste type), update the collection dates.
- **Configuration buttons**: find a source by town, operator or country; test the schedules.
- **Rename and hide waste types**, choose the update interval, texts in English, French, German and Spanish.

## How it works

![Architecture: Gladys, the integration container (Node.js and the Python library), the sources (illustration)](docs/assets/architecture.svg)

```mermaid
flowchart LR
  subgraph Gladys["Gladys Assistant"]
    D[Discover / devices]
    C[Calendar]
    S[Scenes]
    W[Dashboard widget]
  end
  subgraph Container["Integration container"]
    N["Node.js + Gladys SDK<br/>src/app.js"]
    P["python/bridge.py<br/>Waste Collection Schedule"]
    F[("/data/state.json")]
  end
  Sources["Sources: towns, operators,<br/>apps, ICS links"]
  Gladys <-- "REST /api/integration/v1<br/>+ WebSocket" --> N
  N -- "stdin / stdout JSON" --> P
  N --- F
  P -- HTTPS --> Sources
```

One image runs as two integrations of the store. On every connection, the container asks Gladys for its calendar accounts: a calendar integration gets them, a device integration gets a 403, and the container picks its mode. A one-minute tick fetches the schedules that are due (one short Python process each, one at a time), publishes the new values at midnight and fires the reminders.

```mermaid
sequenceDiagram
  participant U as User
  participant G as Gladys
  participant I as Integration
  participant P as bridge.py
  participant S as Source
  U->>G: configures source + arguments
  G->>I: config-updated
  I->>P: {"command": "fetch", ...}
  P->>S: HTTPS request
  S-->>P: collection dates
  P-->>I: {"ok": true, "collections": [...]}
  I->>G: publishDiscoveredDevices (device per schedule)
  U->>G: adds the device (Discover tab)
  G->>I: device created
  I->>G: publishChangedStates (days until each collection)
  Note over I,G: every evening at the reminder time
  I->>G: publishSceneEvent("collection_tomorrow", ...)
  G->>U: the scene sends "Tomorrow: recycling"
```

## Devices and features

| Feature                                   | Category / type      | Unit | Range    | Value                                                                   |
| ----------------------------------------- | -------------------- | ---- | -------- | ----------------------------------------------------------------------- |
| Next collection (days)                    | `duration / integer` | days | -1 – 400 | days until the next collection: 0 today, 1 tomorrow, -1 nothing planned |
| Next collection                           | `text / text`        |      |          | the waste types of that collection                                      |
| _&lt;waste type&gt;_ (days), one per type | `duration / integer` | days | -1 – 400 | days until the next collection of that type                             |

One device per schedule, external id `ext:<selector>:schedule:<1|2|3>`. Not polled by Gladys (`should_poll: false`): the integration publishes the values after each fetch and at midnight. The waste type names are those of the source; a waste type keeps its feature when it is out of season (value -1).

## Transport

**Cloud only** (`"transports": ["cloud"]`): every source is a web site or an API on the internet, asked from your Gladys every 12 hours by default. The catalog shows the cloud badge; there is no "Prefer the local connection" button (single channel). Your address, or what your source needs (a street, a house number, a calendar link), is sent to that source and to nobody else; nothing goes through a Gladys server.

## Widget

![The "Upcoming collections" widget, one schedule then two (generated illustration, not a screenshot)](docs/assets/widgets.en.png)

**Upcoming collections**: the next collection (tile), the next collection days with a bin of the right color (list), the state of each schedule, and a **Refresh** button. Settings: the schedule shown (all or one), the number of collection days (3, 5 or 8), the Refresh button. The image above is generated by `docs/illustrations/render.sh` from the real code of the widget, rendered like the Gladys front.

## Scene triggers and actions

| Trigger               | When                                                      | Filters              | Variables                                       |
| --------------------- | --------------------------------------------------------- | -------------------- | ----------------------------------------------- |
| `collection_tomorrow` | the evening before a collection day, at the reminder time | schedule             | `waste_types`, `count`, `date`, `schedule_name` |
| `waste_type_tomorrow` | the same moment, once per waste type                      | schedule, waste type | `waste_type`, `date`, `schedule_name`           |
| `collection_today`    | the morning of a collection day, at the morning time      | schedule             | `waste_types`, `count`, `date`, `schedule_name` |
| `fetch_failed`        | once, when a source starts failing                        | schedule             | `schedule_name`, `source`, `error`              |

| Action                | Fields                          | Outputs                                                     |
| --------------------- | ------------------------------- | ----------------------------------------------------------- |
| `get_next_collection` | schedule, waste type (optional) | `found`, `date`, `days`, `waste_types`, `schedule_name`     |
| `refresh`             | schedule                        | `success`, `error`, `next_date`, `next_waste_types`, `days` |

Examples:

- **Waste collection tomorrow** → send "Tomorrow: {{triggerEvent.data.waste_types}}, take the bins out".
- **Waste type collected tomorrow**, waste type "Glass" → turn the hall light green for 10 minutes.
- **Waste collection today** → if the garage door is closed, send "Collection this morning".

A reminder fires once per collection, even across restarts, up to 3 hours late if Gladys was off. `fetch_failed` never fires after a refresh asked by a scene (no loop).

## Calendar variant

[Waste Collection Calendar](https://github.com/William-De71/gladys-waste-collection-calendar) is the same image with a `type: "calendar"` manifest (Gladys 5.2.0 or later). Every user who enables it in **My calendars** gets one calendar per schedule: an all-day event per collection and waste type, from 35 days back to 400 days ahead, pushed again when the source changes. The widget, the triggers and the actions are the same. Its repository only holds the manifest, the docs and a workflow that follows the releases of this one.

## Requirements

- Gladys Assistant **5.1.1 or later** (widgets and scene triggers need 5.1; older instances cannot install the integration). 5.2.0 or later for the calendar variant.
- Internet access from Gladys.
- A source for your address: see the [list of the sources](https://github.com/mampfes/hacs_waste_collection_schedule#supported-service-providers), or the **ics** source with a calendar link.

## Installation

- **From the store**: Integrations → search "Waste Collection Schedule" → Install.
- **From the repository URL**: Integrations → Install an integration → paste `https://github.com/William-De71/gladys-waste-collection-schedule`.
- **Developer mode**: Integrations → Install an integration → Developer mode, with the manifest of a build (the summary of the "Build and publish image" workflow prints it).

## Configuration

| Field                   | Type   | Default | Meaning                                                                                             |
| ----------------------- | ------ | ------- | --------------------------------------------------------------------------------------------------- |
| `name_1` … `name_3`     | string |         | name of the schedule (device, widget, scenes)                                                       |
| `source_1` … `source_3` | string |         | Waste Collection Schedule source, e.g. `ics`, `opendata_bordeauxmetropole_fr` (schedule 1 required) |
| `args_1` … `args_3`     | string |         | arguments: JSON object or `key=value; key=value`                                                    |
| `rename`                | string |         | `Original=New; …`                                                                                   |
| `hide`                  | string |         | `Type; Type`                                                                                        |
| `reminder_time`         | select | `19:00` | evening reminder, 16:00 to 22:00 or `off`                                                           |
| `morning_time`          | select | `06:00` | morning reminder, 05:00 to 10:00 or `off`                                                           |
| `refresh_hours`         | select | `12`    | update every 6, 12 or 24 hours                                                                      |
| `language`              | select | `en`    | language of the device and feature names                                                            |

Buttons of the configuration page: **Find a source** (search by town, operator or country: source, known arguments, arguments to fill in, documentation link) and **Test the schedules** (asks every source now and shows what it returned, or the error with the suggestions of the source).

## Usage

1. Find your source with **Find a source**, fill in schedule 1, save, press **Test the schedules**.
2. Discover tab → add the device "Waste collection _&lt;name&gt;_".
3. Add the **Upcoming collections** widget to a dashboard.
4. Create a scene on **Waste collection tomorrow** to be reminded.

The user documentation is in [docs/en.md](docs/en.md) ([fr](docs/fr.md), [de](docs/de.md), [es](docs/es.md)).

## Local development

```bash
npm install
scripts/dev-setup.sh          # the pinned Waste Collection Schedule in .wcs/ (lib + venv)
WCS_PYTHON=.wcs/venv/bin/python WCS_LIB_DIR=.wcs/lib WCS_DATA_DIR=.wcs/data \
  GLADYS_HOST_API_URL=http://localhost:1443 \
  GLADYS_INTEGRATION_TOKEN=… GLADYS_INTEGRATION_SELECTOR=… \
  DEBUG=gladys-integration-sdk node index.js
```

| Variable       | Default            | Use                                               |
| -------------- | ------------------ | ------------------------------------------------- |
| `WCS_PYTHON`   | `python3`          | Python interpreter with the requirements          |
| `WCS_LIB_DIR`  | `/app/python/lib`  | folder of the `waste_collection_schedule` package |
| `WCS_BRIDGE`   | `python/bridge.py` | the bridge script                                 |
| `WCS_DATA_DIR` | `/data`            | state file and temporary files                    |
| `WCS_DEBUG`    | unset              | debug logs of the sources (stderr)                |

Try one source directly: `echo '{"command": "fetch", "source": "ics", "args": {"url": "…"}}' | WCS_LIB_DIR=.wcs/lib .wcs/venv/bin/python -I python/bridge.py`.

| Script                            | What it does                            |
| --------------------------------- | --------------------------------------- |
| `npm test`                        | the tests (`node --test`), no network   |
| `npm run lint`                    | ESLint                                  |
| `npm run format` / `format:check` | Prettier                                |
| `docs/illustrations/render.sh`    | regenerate the widget illustrations     |
| `scripts/build-cover.sh`          | regenerate `cover.jpg` from `cover.svg` |

## Tests

`npm test` runs the whole integration against the fake Gladys of the SDK (devices, states, reminders across midnight and DST, widget content validated by `validateWidgetContent`, calendars), the real `python/bridge.py` against a stand-in library, the manifest against the code, the translations and the release script. The CI also builds the image and starts it like Gladys does (read-only, 256 MB, no network): the engine answers and every bundled source imports.

## Release process

Every merge on `main` publishes a release when its commits deserve one, with no manual step:

```mermaid
flowchart LR
  A[merge on main] --> B[CI: Prettier, ESLint,<br/>tests, Docker build]
  B --> C[next version from<br/>Conventional Commits]
  C --> D[CHANGELOG.md section]
  D --> E[commit chore release<br/>+ tag vX.Y.Z]
  E --> F[image :X.Y.Z + :latest<br/>amd64 + arm64]
  F --> G[main moves to<br/>the release commit]
  G --> H[GitHub Release]
  H --> I[verify: anonymous pull,<br/>store validator, topic]
```

- `feat` → minor, `fix` / `perf` → patch, `!` or `BREAKING CHANGE:` → major (a minor below 1.0.0). `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build` alone publish nothing.
- The pull request title becomes the squash commit, hence the changelog line: write it in English, for the user (`feat(widgets): …`). `pr-title.yml` checks it. Never edit `CHANGELOG.md` by hand.
- The image exists before `main` announces its version (the store indexes `main`).
- 1.0.0 is a manual decision: Actions → Release → Run workflow, `release-as: 1.0.0`. `dry-run` shows the version and the changelog without publishing.
- **Protected `main`**: the release pushes a commit to `main`. With a branch protection or a ruleset, allow GitHub Actions to bypass it (or use a GitHub App), otherwise the release stops after the image.
- **Waste Collection Schedule updates**: `wcs-update.yml` opens a pull request every time upstream publishes a release (enable Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"). A pull request opened by GitHub Actions starts no workflow: close and reopen it to run the CI.
- **Calendar variant**: the [calendar repository](https://github.com/William-De71/gladys-waste-collection-calendar) checks every 6 hours for a new release here and follows it once the image is public.
- After the first release, make the package public: Package settings → Change visibility → Public.

## Troubleshooting

- **Test the schedules** explains most problems: unknown source, invalid argument (with the suggestions of the source), source down.
- A source broken here is usually broken in Home Assistant too: check, then report it to [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule/issues).
- After a rename of a waste type, delete the device and add it again (features are keyed by type name).
- Logs: the Logs tab of the integration; `DEBUG=gladys-integration-sdk` for the SDK details.

## Contributing

Issues and pull requests are welcome. Run `npm run format:check`, `npm run lint` and `npm test`, write the pull request title as a Conventional Commit, and run `docs/illustrations/render.sh` after any change to the widget content. New sources belong upstream, in [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule).

## Security

See [SECURITY.md](SECURITY.md). The engine runs with a minimal environment (never the Gladys token), in the read-only container of the integration.

## License

[Apache License 2.0](LICENSE), see also [NOTICE](NOTICE). The image bundles [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule) (MIT, © Steffen Zimmermann). Not affiliated with Waste Collection Schedule nor with the waste operators.
