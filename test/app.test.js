// The whole integration against the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`, which checks the discovered
// scene events and the calendars like the host API),
// a fake engine and a clock moved by hand, in Europe/Paris.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent, validateWidgetImage } from '@gladysassistant/integration-sdk';

import { createApp } from '../src/app.js';
import { BridgeError } from '../src/bridge.js';
import {
  bordeauxCollections,
  fakeBridge,
  fakeClock,
  silentLogger,
  tempStore,
  TZ,
} from './helpers.js';

const MANIFEST = JSON.parse(
  readFileSync(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

const CONFIG = {
  name_1: 'Maison',
  source_1: 'opendata_bordeauxmetropole_fr',
  args_1: '{"city": "Bordeaux", "address": "20 Cours Pasteur"}',
  language: 'fr',
};

// A user who enabled the integration in "My calendars".
const JOHN = { user: { selector: 'john', firstname: 'John', language: 'fr' }, config: {} };

const OK = { ok: true, title: 'Bordeaux Métropole', collections: bordeauxCollections() };

/**
 * @description An integration wired to the fake Gladys.
 * @param {object} [options] - `{ config, answers, start, fake }`.
 * @returns {Promise<object>} `{ gladys, fake, app, bridge, clock, store, cleanup }`.
 */
async function setup({
  config = CONFIG,
  answers = { opendata_bordeauxmetropole_fr: OK },
  start = '2026-10-15T08:00:00Z',
  fake = {},
} = {}) {
  const gladys = createFakeGladys({ config, calendarAccounts: [JOHN], ...fake });
  const bridge = fakeBridge(answers);
  const clock = fakeClock(start);
  const { store, cleanup } = tempStore();
  const app = createApp(gladys, {
    bridge,
    store,
    now: clock.now,
    timeZone: TZ,
    sleep: async () => {},
    logger: silentLogger,
  });
  await gladys.connect();
  await app.tick();
  return { gladys, fake: gladys.fake, app, bridge, clock, store, cleanup };
}

const eventsOf = (fake, calendar) =>
  fake.calendarEvents.filter((event) => event.calendar_external_id.endsWith(calendar));

test('a calendar per schedule, an all-day event per collection and waste type', async () => {
  const { fake, bridge, cleanup } = await setup();
  try {
    assert.equal(bridge.calls.length, 1);
    assert.deepEqual(bridge.calls[0].args, { city: 'Bordeaux', address: '20 Cours Pasteur' });
    assert.equal(fake.discoveredDevices.length, 0, 'a calendar integration has no devices');
    assert.deepEqual(
      eventsOf(fake, ':john:schedule-1').map((event) => `${event.start} ${event.name}`),
      [
        '2026-10-12 Ordures ménagères',
        '2026-10-16 Ordures ménagères',
        '2026-10-16 Tri sélectif',
        '2026-10-19 Ordures ménagères',
        '2026-10-23 Verre',
        '2026-10-26 Ordures ménagères',
        '2026-10-30 Tri sélectif',
        '2027-01-08 Sapins de Noël',
      ],
    );
    assert.equal(fake.connectionStatus.connected, true);
  } finally {
    cleanup();
  }
});

test('midnight: the widget moves on, the window of the calendar slides once', async () => {
  const { fake, clock, app, cleanup } = await setup();
  try {
    const pushes = fake.publishedCalendarEvents.length;
    const tile = async () =>
      (await fake.widgetGet('upcoming', { settings: {}, language: 'en' })).data.content
        .components[0].value.en;
    assert.equal(await tile(), 'Tomorrow');
    clock.set('2026-10-15T22:00:30Z'); // midnight in Paris
    await app.tick();
    assert.equal(await tile(), 'Today');
    // The 35-day window starts one day later: one push per calendar and day.
    assert.equal(fake.publishedCalendarEvents.length, pushes + 1);
    clock.set('2026-10-15T23:00:00Z');
    await app.tick();
    assert.equal(fake.publishedCalendarEvents.length, pushes + 1);
    assert.ok(fake.widgetRefreshes.includes('upcoming'));
  } finally {
    cleanup();
  }
});

test('reminders: the evening before and the morning of, once each', async () => {
  const { fake, clock, app, cleanup } = await setup();
  try {
    clock.set('2026-10-15T16:59:00Z'); // 18:59 in Paris
    await app.tick();
    assert.equal(fake.sceneEvents.length, 0);

    clock.set('2026-10-15T17:00:00Z'); // 19:00
    await app.tick();
    const keys = fake.sceneEvents.map((event) => event.key);
    assert.deepEqual(keys, ['collection_tomorrow', 'waste_type_tomorrow', 'waste_type_tomorrow']);
    assert.deepEqual(fake.sceneEvents[0].data, {
      schedule: '1',
      schedule_name: 'Maison',
      waste_types: 'Ordures ménagères, Tri sélectif',
      count: 2,
      date: '2026-10-16',
    });
    assert.deepEqual(
      fake.sceneEvents.slice(1).map((event) => event.data.waste_type),
      ['Ordures ménagères', 'Tri sélectif'],
    );

    clock.set('2026-10-15T17:30:00Z');
    await app.tick();
    assert.equal(fake.sceneEvents.length, 3, 'never twice');

    clock.set('2026-10-16T04:00:00Z'); // 06:00
    await app.tick();
    assert.equal(fake.sceneEvents.length, 4);
    assert.equal(fake.sceneEvents[3].key, 'collection_today');
    assert.equal(fake.sceneEvents[3].data.date, '2026-10-16');
  } finally {
    cleanup();
  }
});

test('reminders: a restart within 3 hours still reminds, later it does not', async () => {
  const late = await setup({ start: '2026-10-15T19:30:00Z' }); // 21:30
  try {
    assert.equal(late.fake.sceneEvents.filter((e) => e.key === 'collection_tomorrow').length, 1);
  } finally {
    late.cleanup();
  }
  const tooLate = await setup({ start: '2026-10-15T21:30:00Z' }); // 23:30
  try {
    assert.equal(tooLate.fake.sceneEvents.length, 0);
  } finally {
    tooLate.cleanup();
  }
  const off = await setup({
    config: { ...CONFIG, reminder_time: 'off' },
    start: '2026-10-15T17:30:00Z',
  });
  try {
    assert.equal(off.fake.sceneEvents.length, 0);
  } finally {
    off.cleanup();
  }
});

test('a failing source: one fetch_failed event, a retry later, the error shown', async () => {
  let answer = { ok: false, kind: 'fetch', error: 'HTTPError: 503' };
  const { fake, clock, app, bridge, cleanup } = await setup({
    answers: { opendata_bordeauxmetropole_fr: () => answer },
  });
  try {
    assert.deepEqual(fake.sceneEvents, [
      {
        key: 'fetch_failed',
        data: {
          schedule: '1',
          schedule_name: 'Maison',
          source: 'opendata_bordeauxmetropole_fr',
          // In the language of the configuration (French here).
          error: 'la source a échoué : HTTPError: 503',
        },
      },
    ]);
    assert.equal(fake.connectionStatus.connected, false);
    assert.equal(fake.connectionStatus.message.fr, 'Maison : la source a échoué : HTTPError: 503');

    // Retried after 15 minutes, still failing: no new event.
    clock.set('2026-10-15T08:10:00Z');
    await app.tick();
    assert.equal(bridge.calls.length, 1);
    clock.set('2026-10-15T08:15:00Z');
    await app.tick();
    assert.equal(bridge.calls.length, 2);
    assert.equal(fake.sceneEvents.length, 1);

    // Back: the connection status follows; the next retry waits 30 minutes.
    answer = OK;
    clock.set('2026-10-15T08:44:00Z');
    await app.tick();
    assert.equal(bridge.calls.length, 2);
    clock.set('2026-10-15T08:45:00Z');
    await app.tick();
    assert.equal(bridge.calls.length, 3);
    assert.equal(fake.connectionStatus.connected, true);
  } finally {
    cleanup();
  }
});

test('an engine timeout keeps the last good dates', async () => {
  let fail = false;
  const { fake, clock, app, cleanup } = await setup({
    answers: {
      opendata_bordeauxmetropole_fr: () => {
        if (fail) {
          throw new BridgeError('timeout', 'no answer after 100 s');
        }
        return OK;
      },
    },
  });
  try {
    fail = true;
    clock.set('2026-10-15T20:00:00Z'); // 12 hours later
    await app.tick();
    assert.equal(fake.connectionStatus.connected, false);
    assert.match(fake.connectionStatus.message.en, /took too long/);
    const content = (await fake.widgetGet('upcoming', { settings: {}, language: 'en' })).data
      .content;
    assert.equal(content.components.find((c) => c.type === 'card-list').items.length, 5);
    assert.equal(content.components.find((c) => c.type === 'status').items[0].color, 'danger');
  } finally {
    cleanup();
  }
});

test('the widget: valid content, bins, refresh button', async () => {
  const { fake, bridge, cleanup } = await setup();
  try {
    const ack = await fake.widgetGet('upcoming', { settings: { count: '3' }, language: 'fr' });
    assert.equal(ack.success, true);
    const { content } = ack.data;
    assert.deepEqual(validateWidgetContent(content), []);
    const list = content.components.find((c) => c.type === 'card-list');
    assert.deepEqual(
      list.items.map((item) => item.title),
      ['Ordures ménagères, Tri sélectif', 'Ordures ménagères', 'Verre'],
    );
    // The exact form the Gladys front shows as a calendar day, without a time.
    assert.equal(list.items[0].date, '2026-10-16T00:00:00.000Z');
    for (const item of list.items) {
      assert.match(item.date, /^(\d{4}-\d{2}-\d{2})(T00:00:00(\.000)?Z)?$/);
      const image = await fake.widgetGetImage(item.image);
      assert.equal(image.success, true);
      assert.deepEqual(validateWidgetImage(image.data.image), []);
    }
    const toast = await fake.widgetAction('upcoming', 'refresh', { schedule: 'all' });
    assert.equal(toast.data.message.fr, 'Dates de collecte mises à jour');
    assert.equal(bridge.calls.length, 2);
  } finally {
    cleanup();
  }
});

test('scene actions: next collection, refresh', async () => {
  const { fake, cleanup } = await setup();
  try {
    const glass = await fake.sceneAction('get_next_collection', { waste_type: 'verre' });
    assert.deepEqual(glass.data.outputs, {
      found: true,
      date: '2026-10-23',
      days: 8,
      waste_types: 'Verre',
      schedule_name: 'Maison',
    });
    const none = await fake.sceneAction('get_next_collection', { waste_type: 'textile' });
    assert.equal(none.data.outputs.found, false);

    const refreshed = await fake.sceneAction('refresh', { schedule: 'all' });
    assert.deepEqual(refreshed.data.outputs, {
      success: true,
      error: '',
      next_date: '2026-10-16',
      next_waste_types: 'Ordures ménagères, Tri sélectif',
      days: 1,
    });
    const declared = MANIFEST.scene_actions.map((action) => [
      action.key,
      action.outputs.map((output) => output.key).sort(),
    ]);
    assert.deepEqual(
      Object.keys(glass.data.outputs).sort(),
      Object.fromEntries(declared).get_next_collection,
    );
    assert.deepEqual(
      Object.keys(refreshed.data.outputs).sort(),
      Object.fromEntries(declared).refresh,
    );
  } finally {
    cleanup();
  }
});

test('a refresh from a scene never fires fetch_failed (no loop)', async () => {
  let answer = OK;
  const { fake, cleanup } = await setup({
    answers: { opendata_bordeauxmetropole_fr: () => answer },
  });
  try {
    answer = { ok: false, kind: 'fetch', error: 'down' };
    const result = await fake.sceneAction('refresh', {});
    assert.equal(result.data.outputs.success, false);
    assert.equal(fake.sceneEvents.length, 0);
  } finally {
    cleanup();
  }
});

test('configuration buttons: find a source, test the schedules', async () => {
  const answers = {
    opendata_bordeauxmetropole_fr: OK,
    __search: {
      ok: true,
      total: 22,
      results: [
        {
          title: 'Bordeaux',
          country: 'France',
          module: 'opendata_bordeauxmetropole_fr',
          default_params: { city: 'Bordeaux' },
          params: [
            { name: 'address', required: true },
            { name: 'city', required: true },
          ],
          docs_url:
            'https://github.com/mampfes/hacs_waste_collection_schedule/blob/master/doc/source/opendata_bordeauxmetropole_fr.md',
        },
      ],
    },
  };
  const { fake, cleanup } = await setup({ answers });
  try {
    const found = await fake.action('search_source', { query: 'Bordeaux' });
    assert.equal(
      found.data.message.fr,
      '22 source(s) trouvée(s), les 1 premières :\nBordeaux (France) → source : opendata_bordeauxmetropole_fr · arguments : {"city":"Bordeaux"} · à compléter : address\n  https://github.com/mampfes/hacs_waste_collection_schedule/blob/master/doc/source/opendata_bordeauxmetropole_fr.md',
    );
    const short = await fake.action('search_source', { query: 'B' });
    assert.match(short.data.message.en, /at least 2 characters/);

    const tested = await fake.action('test_sources', {});
    assert.equal(
      tested.data.message.en,
      'Maison: OK, 6 dates, 4 type(s): Ordures ménagères, Sapins de Noël, Tri sélectif, Verre. Next: Ordures ménagères, Tri sélectif, 2026-10-16 (Tomorrow).',
    );
  } finally {
    cleanup();
  }
});

test('test button: a wrong argument shows the suggestions of the source', async () => {
  const { fake, cleanup } = await setup({
    answers: {
      opendata_bordeauxmetropole_fr: {
        ok: false,
        kind: 'bad_args',
        error: 'City not found',
        argument: 'city',
        suggestions: ['Bordeaux', 'Bègles'],
      },
    },
  });
  try {
    const tested = await fake.action('test_sources', {});
    assert.equal(
      tested.data.message.en,
      'Maison: ERROR, invalid arguments: City not found (suggestions for "city": Bordeaux, Bègles)',
    );
  } finally {
    cleanup();
  }
});

test('configuration: renames, hidden types, invalid arguments, removed schedule', async () => {
  const { fake, bridge, app, cleanup } = await setup();
  try {
    await fake.configUpdated({
      ...CONFIG,
      rename: 'Tri sélectif=Bac jaune',
      hide: 'Sapins de Noël',
      source_2: 'ics',
      args_2: 'url = https://example.org/cal.ics',
      source_3: 'ics',
      args_3: '{not json',
    });
    await app.tick();
    // Same arguments for schedule 1: not fetched again.
    assert.deepEqual(
      bridge.calls.map((call) => call.source),
      ['opendata_bordeauxmetropole_fr', 'ics'],
    );
    assert.deepEqual(bridge.calls[1].args, { url: 'https://example.org/cal.ics' });
    const names = new Set(eventsOf(fake, ':john:schedule-1').map((event) => event.name));
    assert.ok(names.has('Bac jaune'));
    assert.ok(!names.has('Tri sélectif'));
    assert.ok(!names.has('Sapins de Noël'));
    // Schedule 2 failed (unknown source here), schedule 3 never reached the
    // engine: no calendar for them until they work.
    assert.deepEqual(
      fake.calendars.map((calendar) => calendar.external_id.split(':').pop()),
      ['schedule-1'],
    );
    // Schedule 3: rejected before reaching the engine.
    assert.match(fake.connectionStatus.message.en, /Schedule 2: unknown source "ics"|JSON/);

    await fake.configUpdated(CONFIG);
    assert.deepEqual(fake.deletedCalendars, []);
  } finally {
    cleanup();
  }
});

test('no source configured: a clear status and widget', async () => {
  const { fake, bridge, cleanup } = await setup({ config: {} });
  try {
    assert.equal(bridge.calls.length, 0);
    assert.equal(fake.connectionStatus.connected, false);
    assert.equal(fake.publishedCalendars.length, 0);
    const content = (await fake.widgetGet('upcoming', { settings: {} })).data.content;
    assert.deepEqual(validateWidgetContent(content), []);
    assert.equal(content.components[0].type, 'text');
  } finally {
    cleanup();
  }
});

test('every enabled user gets the calendars, in their language', async () => {
  const accounts = [
    { user: { selector: 'john', firstname: 'John', language: 'fr' }, config: {} },
    { user: { selector: 'jane', firstname: 'Jane', language: 'de' }, config: {} },
  ];
  const { fake, app, cleanup } = await setup({ fake: { calendarAccounts: accounts } });
  try {
    assert.deepEqual(
      fake.publishedCalendars.map((batch) => [batch.user, batch.calendars[0].name]),
      [
        ['john', 'Collecte des déchets – Maison'],
        ['jane', 'Müllabfuhr – Maison'],
      ],
    );
    const john = fake.publishedCalendarEvents.find((batch) =>
      batch.calendar_external_id.includes(':john:'),
    );
    assert.equal(john.calendar_external_id, 'ext:test-integration:john:schedule-1');
    assert.equal(john.events.length, 8);
    assert.deepEqual(john.events[0], {
      external_id: 'ext:test-integration:john:s1:2026-10-12:ordures_menageres',
      name: 'Ordures ménagères',
      start: '2026-10-12',
      end: '2026-10-13',
      full_day: true,
      description: 'Maison',
    });
    assert.deepEqual(john.window, { from: '2026-09-10', to: '2027-11-20' });

    // Nothing changed: nothing pushed again.
    const before = fake.publishedCalendarEvents.length;
    await app.refresh();
    assert.equal(fake.publishedCalendarEvents.length, before);
  } finally {
    cleanup();
  }
});

test('a calendar not synchronized is skipped, a removed schedule deleted', async () => {
  const accounts = [{ user: { selector: 'john', firstname: 'John', language: 'en' }, config: {} }];
  const { fake, cleanup } = await setup({ fake: { calendarAccounts: accounts } });
  try {
    const calendar = fake.calendars.find((c) => c.external_id.endsWith(':schedule-1'));
    calendar.sync = false;
    const before = fake.publishedCalendarEvents.length;
    await fake.calendarAccountUpdated('john');
    assert.equal(fake.publishedCalendarEvents.length, before);

    await fake.configUpdated({});
    assert.deepEqual(fake.deletedCalendars, ['ext:test-integration:john:schedule-1']);
  } finally {
    cleanup();
  }
});

test('shutdown stops the timers', async () => {
  const { app, cleanup } = await setup();
  try {
    app.start();
    app.stop();
  } finally {
    cleanup();
  }
});
