// The manifest and the code agree: every declared action, trigger, widget and
// configuration key has its code, every version says the same thing, and the
// manifest respects what the store and the Gladys core expect.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';

import { ACTIONS, createApp, SCENE_ACTIONS } from '../src/app.js';
import {
  ADDRESS_FIELDS,
  DEFAULT_MORNING,
  DEFAULT_REFRESH_HOURS,
  DEFAULT_REMINDER,
  MORNING_TIMES,
  OFF,
  REFRESH_HOURS,
  REMINDER_TIMES,
  SLOTS,
} from '../src/config.js';
import { TRIGGERS } from '../src/events.js';
import { LANGUAGES } from '../src/i18n.js';
import { ALL, COUNTS, DEFAULT_COUNT, WIDGET_KEY } from '../src/widgets.js';
import { fakeBridge, silentLogger, tempStore } from './helpers.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('gladys-assistant-integration.json'));
const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

test('one version everywhere, image of this repository', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(
    manifest.docker_image,
    `ghcr.io/william-de71/gladys-waste-collection-schedule:${pkg.version}`,
  );
  assert.equal(pkg.license, 'Apache-2.0');
  assert.match(
    manifest.cover_image,
    /^https:\/\/raw\.githubusercontent\.com\/William-De71\/gladys-waste-collection-schedule\/main\/cover\.jpg$/,
  );
});

test('store rules: type, Gladys version, transports, categories, descriptions', () => {
  // A calendar integration needs 5.2.0 (code-enforced by the store indexer).
  assert.equal(manifest.type, 'calendar');
  assert.equal(manifest.gladys_version, '>=5.2.0');
  // Nothing to ask per user: every user just enables the integration.
  assert.equal(manifest.account_schema, undefined);
  // Every source is a web site or an API: nothing on the local network.
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['services']);
  for (const language of LANGUAGES) {
    const length = manifest.description[language].length;
    assert.ok(length >= 10 && length <= 100, `${language}: ${length}`);
  }
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  // The names of the houses name the schedules (GET /house).
  assert.equal(manifest.location, true);
  // No permission the code does not use.
  for (const key of ['network_wake', 'network_discovery', 'containers', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
  // The store indexer refuses a manifest over 100 KB.
  assert.ok(Buffer.byteLength(read('gladys-assistant-integration.json')) < 90 * 1024);
});

test('configuration keys of the code are declared, with the same choices', () => {
  const fields = Object.fromEntries(manifest.config_schema.map((field) => [field.key, field]));
  for (const slot of SLOTS) {
    const keys = ['source', 'args', ...ADDRESS_FIELDS].map((name) => `${name}_${slot}`);
    for (const key of keys) {
      assert.equal(fields[key]?.type, 'string', key);
      assert.equal(fields[key].required, undefined, `${key}: the town alone is often enough`);
    }
    assert.equal(fields[`house_${slot}`].source, 'houses');
    // Same countries as the library (python/check_sources.py checks it upstream).
    assert.ok(fields[`country_${slot}`].options.some((option) => option.value === 'France'));
    // name_<n> left the form for the house; still read for older configurations.
    assert.equal(fields[`name_${slot}`], undefined);
  }
  assert.equal(fields.rename.type, 'string');
  assert.equal(fields.hide.type, 'string');
  const values = (key) => fields[key].options.map((option) => option.value);
  assert.deepEqual(values('reminder_time'), [...REMINDER_TIMES, OFF]);
  assert.deepEqual(values('morning_time'), [...MORNING_TIMES, OFF]);
  assert.deepEqual(values('refresh_hours'), REFRESH_HOURS);
  assert.deepEqual(values('language'), LANGUAGES);
  assert.equal(fields.reminder_time.default, DEFAULT_REMINDER);
  assert.equal(fields.morning_time.default, DEFAULT_MORNING);
  assert.equal(fields.refresh_hours.default, String(DEFAULT_REFRESH_HOURS));
  // No secret: nothing sensitive in a source's arguments is expected, and a
  // `text` / `password` type would be refused by the store.
  for (const field of manifest.config_schema) {
    assert.ok(['string', 'select', 'section'].includes(field.type), field.key);
  }
});

test('every declared action, widget and scene action has its handler', async () => {
  const gladys = createFakeGladys();
  const { store, cleanup } = tempStore();
  try {
    createApp(gladys, { bridge: fakeBridge(), store, logger: silentLogger });
    await gladys.connect();
    for (const action of manifest.actions) {
      const ack = await gladys.fake.action(action.key, { query: 'xy' });
      assert.notEqual(ack.error, 'not implemented', action.key);
    }
    assert.deepEqual(
      manifest.actions.map((action) => action.key).sort(),
      Object.values(ACTIONS).sort(),
    );
    for (const action of manifest.scene_actions) {
      const ack = await gladys.fake.sceneAction(action.key, {});
      assert.equal(ack.success, true, action.key);
    }
    assert.deepEqual(
      manifest.scene_actions.map((action) => action.key).sort(),
      Object.values(SCENE_ACTIONS).sort(),
    );
    assert.deepEqual(
      manifest.widgets.map((widget) => widget.key),
      [WIDGET_KEY],
    );
    assert.equal((await gladys.fake.widgetGet(WIDGET_KEY, { settings: {} })).success, true);
  } finally {
    cleanup();
  }
});

test('scene triggers: the keys the code fires, their filters and variables', () => {
  const triggers = Object.fromEntries(
    manifest.scene_triggers.map((trigger) => [trigger.key, trigger]),
  );
  assert.deepEqual(Object.keys(triggers).sort(), Object.values(TRIGGERS).sort());
  const data = {
    collection_tomorrow: ['schedule', 'schedule_name', 'waste_types', 'count', 'date'],
    collection_today: ['schedule', 'schedule_name', 'waste_types', 'count', 'date'],
    waste_type_tomorrow: ['schedule', 'schedule_name', 'waste_type', 'date'],
    fetch_failed: ['schedule', 'schedule_name', 'source', 'error'],
  };
  for (const [key, keys] of Object.entries(data)) {
    const declared = new Set([
      ...triggers[key].fields.map((field) => field.key),
      ...triggers[key].variables.map((variable) => variable.key),
    ]);
    for (const dataKey of keys) {
      assert.ok(declared.has(dataKey), `${key}.${dataKey}`);
    }
    for (const field of triggers[key].fields) {
      assert.ok(keys.includes(field.key), `${key} filter ${field.key} is in the event data`);
    }
  }
  const scheduleOptions = (field) => field.options.map((option) => option.value);
  for (const trigger of manifest.scene_triggers) {
    const field = trigger.fields.find((candidate) => candidate.key === 'schedule');
    assert.deepEqual(scheduleOptions(field), SLOTS);
  }
});

test('widget settings match the code', () => {
  const [widget] = manifest.widgets;
  const settings = Object.fromEntries(widget.settings.map((setting) => [setting.key, setting]));
  assert.deepEqual(
    settings.schedule.options.map((option) => option.value),
    [ALL, ...SLOTS],
  );
  assert.deepEqual(
    settings.count.options.map((option) => option.value),
    COUNTS,
  );
  assert.equal(settings.count.default, String(DEFAULT_COUNT));
  assert.equal(settings.show_refresh.default, true);
});
