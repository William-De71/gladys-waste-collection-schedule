# Waste Collection Schedule

## Overview

This integration brings the waste collection dates of your address into Gladys Assistant: when the recycling, the glass or the household waste is collected, a reminder the evening before, and a dashboard widget with the next collections.

The dates come from [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule), the library Home Assistant users know: nearly 1,000 sources, from towns and waste operators of about thirty countries, apps (Abfall.IO, Recycle!, ReCollect…) and any ICS calendar link. The library runs inside the container of the integration, unchanged.

It exists in two variants, which share the same code and the same image:

- **Waste Collection Schedule** (this one): one device per schedule, with the days until the next collection of each waste type, usable in tiles, charts and scene conditions;
- **Waste Collection Calendar**: the collections in the Gladys calendar, one calendar per schedule for each user who enables it (Gladys 5.2.0 or later).

Both variants have the widget, the scene triggers and the scene actions. Install the one you prefer, or both.

![The "Upcoming collections" widget, one schedule then two (generated illustration, not a screenshot)](https://raw.githubusercontent.com/William-De71/gladys-waste-collection-schedule/main/docs/assets/widgets.en.png)

**Transport: cloud.** The container asks the web site or the API of your source, from your Gladys, every 12 hours by default. Your address (or what the source needs: a street, a house number, a calendar link) is sent to that source and to nobody else. Nothing goes through a Gladys server.

### Devices and features

| Feature                                   | Value                                                                   |
| ----------------------------------------- | ----------------------------------------------------------------------- |
| Next collection (days)                    | days until the next collection, any type: 0 today, 1 tomorrow           |
| Next collection                           | the waste types of that collection, as text                             |
| _&lt;waste type&gt;_ (days), one per type | days until the next collection of that type, -1 when nothing is planned |

The waste type names are those of the source (for example "Ordures ménagères", "Gelbe Tonne", "Recycling").

## Requirements

- Gladys Assistant 5.1.1 or later (5.2.0 or later for the calendar variant).
- Your Gladys reaches the internet.
- A source for your address. Check the [list of the sources](https://github.com/mampfes/hacs_waste_collection_schedule#supported-service-providers), or use the **Find a source** button of the configuration page. No source for your town? The **ics** source reads any calendar link (`.ics`, `webcal://`) your town hall or operator publishes.

## Configuration

### Find your source and its arguments

1. Open **Integrations → Waste Collection Schedule → Configuration**.
2. At the bottom of the page, type the name of your town or of your waste operator in **Find a source**, then run it. The answer lists the matching sources, with the **source** to copy, the **arguments** already known and those to fill in, and the documentation of the source.
3. Read the documentation of the source: it explains each argument (a street, a house number, an identifier found on the operator's web site).

### Fill in a schedule

| Field     | What to write                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Name      | a name for the schedule, shown in the device, the widget and the scenes (for example "Home")                                   |
| Source    | the name of the source, for example `ics` or `opendata_bordeauxmetropole_fr`                                                   |
| Arguments | a JSON object, for example `{"city": "Bordeaux", "address": "20 Cours Pasteur"}`, or `key=value` pairs separated by semicolons |

Examples:

- an ICS link: source `ics`, arguments `{"url": "https://example.org/collections.ics"}`;
- Bordeaux Métropole: source `opendata_bordeauxmetropole_fr`, arguments `{"city": "Bordeaux", "address": "20 Cours Pasteur"}`.

Up to three schedules: a second home, or a second source for the same address (the town for most bins and an ICS link for glass). Save, then press **Test the schedules**: the answer tells, for each schedule, how many dates and which waste types the source returned, or what is wrong.

### Waste types, reminders and updates

| Field                        | Default  | Use                                                                      |
| ---------------------------- | -------- | ------------------------------------------------------------------------ |
| Rename                       | empty    | `Original=New` pairs separated by semicolons: `Tri sélectif=Yellow bin`  |
| Hide                         | empty    | types to ignore, separated by semicolons: `Christmas trees; Bulky waste` |
| Evening reminder             | 19:00    | time of the "Waste collection tomorrow" triggers, or Off                 |
| Morning reminder             | 06:00    | time of the "Waste collection today" trigger, or Off                     |
| Update the dates every       | 12 hours | how often the sources are asked (6, 12 or 24 hours)                      |
| Language of the device names | English  | language of the device and feature names                                 |

Rename and hide apply to every schedule. A renamed type gets a new feature: see Troubleshooting.

## Usage

### Devices

Open the **Discover** tab: each schedule appears as a device "Waste collection _&lt;name&gt;_". Add it: its values update after every fetch and at midnight. Put the features on a dashboard, draw their history, or use them in scene conditions, for example "days until the glass collection equals 1".

### Widget

In the dashboard editor, add the **Upcoming collections** widget from the Waste Collection Schedule section. It shows the next collection, the next collection days with a bin of the right color (yellow for recycling, blue for paper, green for glass and garden waste, brown for organic waste, grey for household waste), the state of each schedule and a **Refresh** button. Settings: the schedule shown (all, or one), the number of collection days (3, 5 or 8) and the Refresh button.

### Scene triggers

| Trigger                        | When                                                              | Variables                                         |
| ------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------- |
| Waste collection tomorrow      | the evening before a collection day, at the evening reminder time | waste types, number of types, date, schedule name |
| Waste type collected tomorrow  | the same moment, once per waste type (filter on one type)         | waste type, date, schedule name                   |
| Waste collection today         | the morning of a collection day, at the morning reminder time     | waste types, number of types, date, schedule name |
| Collection dates update failed | once, when a source starts failing                                | schedule name, source, error                      |

Each trigger can be filtered on a schedule. A reminder is sent once, even if Gladys restarts; if Gladys was off at the reminder time, it comes up to 3 hours later.

### Scene actions

- **Get the next waste collection** (optionally of one waste type, for example "glass"): found, date, days until then, waste types, schedule name.
- **Update the collection dates**: asks the sources now; returns success, error, next date, next waste types, days until the next collection.

### Scene examples

- **Waste collection tomorrow** → send a message "Tomorrow: {{triggerEvent.data.waste_types}}, take the bins out".
- **Waste type collected tomorrow**, waste type "Verre" → turn the hall light green for 10 minutes.
- **Waste collection today**, at 06:00 → if the garage door is closed, send a message "Collection this morning".

### Calendar variant

Install **Waste Collection Calendar**, configure it the same way, then every user who wants the collections in their calendar enables it in **My calendars**. Each schedule becomes a calendar with an all-day event per collection and waste type, from 35 days back to 400 days ahead. A calendar starts private: turn on **Share with the household** in **My calendars** to show it to the whole household and use it in scenes, with the calendar triggers of Gladys.

## Troubleshooting

- **Unknown source**: check the spelling of the source (lowercase, underscores), as given by **Find a source**.
- **Invalid arguments**: the message of **Test the schedules** names the wrong argument and, when the source knows them, suggests the right values (street names, towns).
- **The source failed** or **took too long**: the web site of the source is down or changed, or it no longer finds your address. The integration retries after 15 minutes, then less and less often, and keeps the last known dates meanwhile. If it lasts, check whether the source works in Home Assistant: if not, report it to [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule/issues), the fix will come with an update of the integration.
- **Wrong or missing dates**: the dates are those of the source. Compare with the web site of your operator, and report a difference upstream.
- **A feature disappeared or appeared after a rename**: features are keyed by waste type name. After a rename (by you or by the source), delete the device and add it again from the **Discover** tab.
- **No reminder**: check the reminder times in the configuration, and that the scene uses the right schedule filter.
- **Logs**: the **Logs** tab of the integration. For more detail, add the environment variable `DEBUG=gladys-integration-sdk`. To report a problem, open an [issue](https://github.com/William-De71/gladys-waste-collection-schedule/issues) with the versions of Gladys and of the integration, the source and the logs.
