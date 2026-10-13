// The manifest and the code agree: every declared action, trigger, widget and
// configuration key has its code, every version says the same thing, and the
// discovered devices respect what the Gladys core expects but does not check
// (see CLAUDE.md, "Pitfalls").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';

import { ACTIONS, createApp, SCENE_ACTIONS } from '../src/app.js';
import {
  DEFAULT_MORNING,
  DEFAULT_REFRESH_HOURS,
  DEFAULT_REMINDER,
  MORNING_TIMES,
  OFF,
  REFRESH_HOURS,
  REMINDER_TIMES,
  SLOTS,
} from '../src/config.js';
import { buildDevice } from '../src/devices.js';
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
  assert.equal(manifest.type, 'device');
  // widgets, scene_triggers and scene_actions need 5.1.0; 5.1.1 is the
  // first release validated with this manifest.
  assert.equal(manifest.gladys_version, '>=5.1.1');
  // Every source is a web site or an API: nothing on the local network.
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['services']);
  for (const language of LANGUAGES) {
    const length = manifest.description[language].length;
    assert.ok(length >= 10 && length <= 100, `${language}: ${length}`);
  }
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  // No permission the code does not use.
  for (const key of ['location', 'network_wake', 'network_discovery', 'containers', 'webhooks']) {
    assert.equal(manifest[key], undefined, key);
  }
});

test('configuration keys of the code are declared, with the same choices', () => {
  const fields = Object.fromEntries(manifest.config_schema.map((field) => [field.key, field]));
  for (const slot of SLOTS) {
    for (const key of [`name_${slot}`, `source_${slot}`, `args_${slot}`]) {
      assert.equal(fields[key]?.type, 'string', key);
    }
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

// Pairs the Gladys front labels (front/src/config/i18n/*.json,
// deviceFeatureCategory.<category>.<type>, checked on v5.1.4 and v5.2.0): a
// pair without a label shows "Device (undefined)" and no icon.
const LABELLED_PAIRS = new Set(['duration/integer', 'text/text']);

test('discovered devices: what the core needs but does not check', () => {
  const gladys = createFakeGladys();
  const device = buildDevice(
    gladys,
    { slot: '1', name: 'Home', source: 'ics' },
    ['Recycling', 'Glass', 'Garden waste'],
    'en',
  );
  assert.equal(device.should_poll, false);
  assert.equal(device.poll_frequency, undefined);
  assert.ok(device.external_id.startsWith('ext:test-integration:schedule:'));
  const categories = Object.values(DEVICE_FEATURE_CATEGORIES);
  for (const feature of device.features) {
    for (const key of ['min', 'max', 'read_only', 'has_feedback']) {
      assert.notEqual(feature[key], undefined, `${feature.external_id}.${key}`);
    }
    assert.ok(feature.min <= feature.max);
    assert.ok(categories.includes(feature.category));
    const typeGroup = Object.entries(DEVICE_FEATURE_CATEGORIES).find(
      ([, value]) => value === feature.category,
    )[0];
    assert.ok(Object.values(DEVICE_FEATURE_TYPES[typeGroup]).includes(feature.type));
    assert.ok(LABELLED_PAIRS.has(`${feature.category}/${feature.type}`));
    if (feature.unit) {
      assert.ok(Object.values(DEVICE_FEATURE_UNITS).includes(feature.unit));
    }
    assert.equal(feature.read_only, true);
    assert.ok(feature.name.length > 0 && feature.name.length <= 100);
    assert.ok(feature.external_id.startsWith(`${device.external_id}:`));
  }
  assert.equal(new Set(device.features.map((f) => f.external_id)).size, device.features.length);
});
