// The pure parts: configuration, dates, collections, bin colors, calendar
// windows, reminders and the state file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';

import { binImageKey, drawBin, familyOf, familyOfImageKey } from '../src/bins.js';
import { buildEvents, splitWindow } from '../src/calendar.js';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildUpcomingWidget, dayFamily } from '../src/widgets.js';
import { normalizeConfig, parseArgs } from '../src/config.js';
import { dueReminders } from '../src/events.js';
import { t, text, truncate } from '../src/i18n.js';
import { cleanCollections, nextByType, typeKey, upcomingDays } from '../src/schedule.js';
import { createStore } from '../src/store.js';
import { addDays, daysBetween, isDate, localClock, parseTime } from '../src/time.js';
import { bordeauxCollections, tempStore } from './helpers.js';

const NO_CUSTOMIZE = { renames: new Map(), hidden: new Set() };

test('arguments: JSON object, key=value pairs, errors', () => {
  assert.deepEqual(parseArgs('{"city": "Bordeaux", "id": 670}'), {
    args: { city: 'Bordeaux', id: 670 },
    error: null,
  });
  assert.deepEqual(parseArgs(' city = Mérignac ; number=12; show=true ').args, {
    city: 'Mérignac',
    number: 12,
    show: true,
  });
  assert.deepEqual(parseArgs(''), { args: {}, error: null });
  assert.equal(parseArgs('{"a": 1').error, 'json');
  assert.equal(parseArgs('[1, 2]').error, 'json');
  assert.equal(parseArgs('just text').error, 'json');
});

test('configuration: slots, renames, reminder times, defaults', () => {
  const config = normalizeConfig({
    source_1: 'ics',
    args_1: '{"url": "https://example.org/a.ics"}',
    source_2: '  ',
    source_3: '../evil',
    rename: 'Tri sélectif=Bac jaune; bad; =x',
    hide: 'Sapins de Noël;  ;Encombrants',
    reminder_time: 'off',
    morning_time: '07:00',
    refresh_hours: '24',
    language: 'de',
  });
  assert.deepEqual(
    config.slots.map((slot) => [slot.slot, slot.source, slot.configError]),
    [
      ['1', 'ics', null],
      ['3', '../evil', 'module'],
    ],
  );
  assert.deepEqual([...config.renames], [['tri sélectif', 'Bac jaune']]);
  assert.deepEqual([...config.hidden], ['sapins de noël', 'encombrants']);
  assert.equal(config.reminderMinutes, null);
  assert.equal(config.morningMinutes, 7 * 60);
  assert.equal(config.refreshHours, 24);
  assert.equal(config.language, 'de');

  const defaults = normalizeConfig({});
  assert.equal(defaults.reminderMinutes, 19 * 60);
  assert.equal(defaults.morningMinutes, 6 * 60);
  assert.equal(defaults.refreshHours, 12);
  assert.equal(defaults.language, 'en');
  assert.deepEqual(defaults.slots, []);
});

test('dates: local clock across timezones and DST, arithmetic', () => {
  // 2026-10-25: end of summer time in Paris.
  assert.deepEqual(localClock(new Date('2026-10-24T22:30:00Z'), 'Europe/Paris'), {
    date: '2026-10-25',
    minutes: 30,
  });
  assert.deepEqual(localClock(new Date('2026-10-25T23:30:00Z'), 'Europe/Paris'), {
    date: '2026-10-26',
    minutes: 30,
  });
  assert.equal(localClock(new Date('2026-10-15T08:00:00Z'), 'Pacific/Auckland').date, '2026-10-15');
  assert.equal(
    localClock(new Date('2026-10-15T08:00:00Z'), 'America/Los_Angeles').date,
    '2026-10-15',
  );
  assert.equal(
    localClock(new Date('2026-10-15T06:00:00Z'), 'America/Los_Angeles').date,
    '2026-10-14',
  );
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-10-24', '2026-10-27'), 3);
  assert.ok(isDate('2028-02-29'));
  assert.ok(!isDate('2026-02-29'));
  assert.ok(!isDate('2026-1-01'));
  assert.equal(parseTime('19:00', 0), 1140);
  assert.equal(parseTime('25:00', 7), 7);
});

test('collections: window, renames, hidden types, duplicates, next ones', () => {
  const raw = [
    ...bordeauxCollections(),
    { date: '2026-10-16', type: 'Tri sélectif', icon: null },
    { date: '2020-01-01', type: 'Old', icon: null },
    { date: '2029-01-01', type: 'Far', icon: null },
    { date: 'tomorrow', type: 'Bad', icon: null },
    { date: '2026-10-17', type: '  ', icon: null },
  ];
  const clean = cleanCollections(
    raw,
    { renames: new Map([['tri sélectif', 'Bac jaune']]), hidden: new Set(['sapins de noël']) },
    '2026-10-15',
  );
  assert.deepEqual(
    clean.map((c) => `${c.date} ${c.type}`),
    [
      '2026-10-12 Ordures ménagères',
      '2026-10-16 Bac jaune',
      '2026-10-16 Ordures ménagères',
      '2026-10-19 Ordures ménagères',
      '2026-10-23 Verre',
      '2026-10-26 Ordures ménagères',
      '2026-10-30 Bac jaune',
    ],
  );
  const days = upcomingDays(clean, '2026-10-15');
  assert.deepEqual(days[0], {
    date: '2026-10-16',
    days: 1,
    types: ['Bac jaune', 'Ordures ménagères'],
    icons: [null, null],
  });
  assert.deepEqual(nextByType(clean, '2026-10-16').get('Verre'), {
    date: '2026-10-23',
    days: 7,
    icon: 'mdi:bottle-wine',
  });
});

test('type keys: stable, ASCII, never empty', () => {
  assert.equal(typeKey('Ordures ménagères'), 'ordures_menageres');
  assert.equal(typeKey('Gelbe Tonne / Gelber Sack'), 'gelbe_tonne_gelber_sack');
  assert.equal(typeKey('Směsný odpad'), 'smesny_odpad');
  assert.match(typeKey('燃えるゴミ'), /^type_[a-z0-9]+$/);
  assert.equal(typeKey('燃えるゴミ'), typeKey('燃えるゴミ'));
  assert.ok(typeKey('x'.repeat(100)).length <= 40);
});

test('bin colors: words in several languages, then the icon', () => {
  const cases = {
    'Tri sélectif': 'recycling',
    'Gelbe Tonne': 'recycling',
    Envases: 'recycling',
    'Ordures ménagères': 'residual',
    Restmüll: 'residual',
    'General waste': 'residual',
    Verre: 'glass',
    Altglas: 'glass',
    Papier: 'paper',
    'Paper & cardboard': 'paper',
    Biomüll: 'organic',
    'Food waste': 'organic',
    'Déchets verts': 'garden',
    'Garden waste': 'garden',
    Encombrants: 'bulky',
    Sperrmüll: 'bulky',
    Schadstoffmobil: 'hazardous',
    'Sapins de Noël': 'garden',
    Textiles: 'textile',
    'Collecte 3': 'other',
  };
  for (const [type, family] of Object.entries(cases)) {
    assert.equal(familyOf(type), family, type);
  }
  assert.equal(familyOf('Tournée B', 'mdi:recycle'), 'recycling');
  assert.equal(
    dayFamily({ types: ['Ordures ménagères', 'Tri sélectif'], icons: [null, null] }),
    'recycling',
  );
  assert.equal(dayFamily({ types: ['Restmüll'], icons: [null] }), 'residual');
  assert.equal(familyOf('Tournée C', 'mdi:leaf'), 'organic');
});

test('bin images: keys round-trip, PNG drawn', () => {
  assert.equal(binImageKey('glass'), 'bin-v1-glass');
  assert.equal(binImageKey('nope'), 'bin-v1-other');
  assert.equal(familyOfImageKey('bin-v1-paper'), 'paper');
  assert.equal(familyOfImageKey('bin-v0-paper'), null);
  assert.equal(familyOfImageKey('../x'), null);
  const png = Buffer.from(drawBin('recycling'), 'base64');
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.ok(png.length < 10 * 1024);
});

test('calendar: events per collection, windows of at most 500 events', () => {
  const gladys = createFakeGladys();
  const events = buildEvents(gladys, 'john', {
    slot: '2',
    name: 'Home',
    collections: cleanCollections(bordeauxCollections(), NO_CUSTOMIZE, '2026-10-15'),
  });
  assert.equal(events[1].external_id, 'ext:test-integration:john:s2:2026-10-16:ordures_menageres');
  assert.equal(events[1].end, '2026-10-17');
  assert.ok(new Set(events.map((e) => e.external_id)).size === events.length);

  const many = Array.from({ length: 1203 }, (_, index) => ({
    start: addDays('2026-01-01', Math.floor(index / 4)),
  }));
  const chunks = splitWindow(many, '2025-12-01', '2027-01-01');
  assert.deepEqual(
    chunks.map((chunk) => [chunk.from, chunk.to, chunk.events.length]),
    [
      ['2025-12-01', '2026-05-06', 500],
      ['2026-05-06', '2026-09-08', 500],
      ['2026-09-08', '2027-01-01', 203],
    ],
  );
  assert.deepEqual(splitWindow([], 'a', 'b'), [{ from: 'a', to: 'b', events: [] }]);
});

test('reminders: one per day and schedule, one per waste type', () => {
  const schedules = [
    {
      slot: '1',
      name: 'Home',
      collections: cleanCollections(bordeauxCollections(), NO_CUSTOMIZE, '2026-10-15'),
    },
  ];
  const config = { reminderMinutes: 19 * 60, morningMinutes: 6 * 60 };
  const fired = new Set(['waste_type_tomorrow:1:2026-10-16:tri_selectif']);
  const events = dueReminders({
    schedules,
    clock: { date: '2026-10-15', minutes: 19 * 60 + 5 },
    config,
    wasFired: (key) => fired.has(key),
  });
  assert.deepEqual(
    events.map((event) => event.key),
    ['collection_tomorrow:1:2026-10-16', 'waste_type_tomorrow:1:2026-10-16:ordures_menageres'],
  );
  for (const event of events) {
    for (const value of Object.values(event.data)) {
      assert.ok(['string', 'number', 'boolean'].includes(typeof value) || value === null);
    }
    assert.ok(Object.keys(event.data).length <= 30);
  }
  assert.equal(
    dueReminders({
      schedules,
      clock: { date: '2026-10-15', minutes: 600 },
      config,
      wasFired: () => false,
    }).length,
    0,
  );
});

test('state file: saved, reloaded, fired events forgotten after a week', () => {
  const { store, path, cleanup } = tempStore();
  try {
    store.updateSlot('1', {
      raw: [{ date: '2026-10-16', type: 'A' }],
    });
    store.markFired('x', '2026-10-01');
    store.markFired('y', '2026-10-15');
    const again = createStore(path);
    assert.deepEqual(again.slot('1').raw, [{ date: '2026-10-16', type: 'A' }]);
    assert.ok(!again.wasFired('x'));
    assert.ok(again.wasFired('y'));
    again.dropSlot('1');
    assert.deepEqual(createStore(path).slots(), []);

    writeFileSync(path, '{broken');
    assert.deepEqual(createStore(path).slots(), []);
  } finally {
    cleanup();
  }
});

test('texts: every language, placeholders filled, truncation', () => {
  assert.deepEqual(t('inDays', { days: 3 }), {
    en: 'In 3 d',
    fr: 'Dans 3 j',
    de: 'In 3 T.',
    es: 'En 3 d',
  });
  assert.equal(text('calendarName', 'xx', { name: 'Home' }), 'Waste collection – Home');
  assert.equal(text('connectionError', 'fr', { name: 'A', error: { en: 'x', fr: 'y' } }), 'A : y');
  assert.equal(truncate('abcdef', 4), 'abc…');
});

test('widget: several schedules name their rows, one schedule does not', () => {
  const collections = cleanCollections(bordeauxCollections(), NO_CUSTOMIZE, '2026-10-15');
  const schedules = [
    { slot: '1', name: 'Home', collections, error: null, fetchedAt: 1 },
    {
      slot: '2',
      name: { en: 'Schedule 2', fr: 'Calendrier 2' },
      collections,
      error: null,
      fetchedAt: 1,
    },
  ];
  const list = (content) => content.components.find((c) => c.type === 'card-list');
  const both = buildUpcomingWidget({ schedules, today: '2026-10-15', settings: { count: '3' } });
  assert.deepEqual(validateWidgetContent(both), []);
  assert.deepEqual(
    list(both).items.map((item) => item.title),
    [
      'Home · Ordures ménagères, Tri sélectif',
      {
        en: 'Schedule 2 · Ordures ménagères, Tri sélectif',
        fr: 'Calendrier 2 · Ordures ménagères, Tri sélectif',
      },
      'Home · Ordures ménagères',
    ],
  );
  const one = buildUpcomingWidget({ schedules, today: '2026-10-15', settings: { schedule: '1' } });
  assert.equal(list(one).items[0].title, 'Ordures ménagères, Tri sélectif');
  assert.deepEqual(one.components.at(-1).action.params, { schedule: '1' });
});
