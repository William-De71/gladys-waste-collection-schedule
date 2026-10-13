// -----------------------------------------------------------------------------
// The "Waste collection <name>" devices (device mode only).
//
// One device per configured schedule slot, offered on the Discovery screen:
//   - next_days   days until the next collection, whatever the type;
//   - next_types  the waste types of that collection, as text;
//   - type_<key>  days until the next collection of one waste type, for every
//                 type the source ever returned (a seasonal type keeps its
//                 feature in winter, with -1: nothing planned).
// 0 = today, 1 = tomorrow. Usable in tiles, charts and scene conditions
// ("days until the paper bin = 1").
//
// No polling by Gladys (`should_poll: false`): the values change at midnight
// and after a fetch, the scheduler publishes them (publishChangedStates).
//
// External ids: ext:<selector>:schedule:<slot>[:<feature>].
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { text, truncate } from './i18n.js';
import { nextByType, typeKey, upcomingDays } from './schedule.js';

export const DEVICE_TYPE = 'schedule';
export const NONE = -1;
const MAX_DAYS = 400;
const MAX_TEXT = 200;

/**
 * @description The display name of a schedule slot.
 * @param {object} slot - Normalized slot (config.js).
 * @param {string} language - Language code.
 * @returns {string} The name the user gave, or "Schedule <n>".
 */
export function scheduleName(slot, language) {
  return slot.name || text('scheduleDefaultName', language, { slot: slot.slot });
}

const daysFeature = (externalId, name) => ({
  name: truncate(name, 100),
  external_id: externalId,
  category: CATEGORIES.DURATION,
  type: TYPES.DURATION.INTEGER,
  unit: UNITS.DAYS,
  min: NONE,
  max: MAX_DAYS,
  read_only: true,
  has_feedback: false,
  keep_history: true,
});

/**
 * @description The device of a schedule slot.
 * @param {object} gladys - SDK client.
 * @param {object} slot - Normalized slot.
 * @param {string[]} types - Waste types the source ever returned.
 * @param {string} language - Language of the names.
 * @returns {object} The device.
 */
export function buildDevice(gladys, slot, types, language) {
  const ids = gladys.externalIds(DEVICE_TYPE, slot.slot);
  const name = scheduleName(slot, language);
  const features = [
    daysFeature(ids.feature('next_days'), text('featureNextDays', language)),
    {
      name: text('featureNextTypes', language),
      external_id: ids.feature('next_types'),
      category: CATEGORIES.TEXT,
      type: TYPES.TEXT.TEXT,
      min: 0,
      max: 0,
      read_only: true,
      has_feedback: false,
      keep_history: true,
    },
  ];
  const keys = new Set();
  for (const type of types) {
    const key = `type_${typeKey(type)}`;
    if (keys.has(key)) {
      continue;
    }
    keys.add(key);
    features.push(daysFeature(ids.feature(key), text('featureTypeDays', language, { type })));
  }
  return {
    name: truncate(text('deviceName', language, { name }), 100),
    external_id: ids.device,
    should_poll: false,
    params: [{ name: 'source', value: slot.source }],
    features,
  };
}

/**
 * @description The states of a schedule device.
 * @param {object} gladys - SDK client.
 * @param {object} slot - Normalized slot.
 * @param {object[]} collections - Clean collections.
 * @param {string[]} types - Waste types of the device.
 * @param {string} today - `YYYY-MM-DD`.
 * @param {string} language - Language of the text feature.
 * @returns {object[]} `[{ device_feature_external_id, state | text }]`.
 */
export function buildStates(gladys, slot, collections, types, today, language) {
  const ids = gladys.externalIds(DEVICE_TYPE, slot.slot);
  const [next] = upcomingDays(collections, today);
  const states = [
    { device_feature_external_id: ids.feature('next_days'), state: next ? next.days : NONE },
    {
      device_feature_external_id: ids.feature('next_types'),
      text: truncate(next ? next.types.join(', ') : text('nothingPlanned', language), MAX_TEXT),
    },
  ];
  const byType = nextByType(collections, today);
  const keys = new Set();
  for (const type of types) {
    const key = `type_${typeKey(type)}`;
    if (keys.has(key)) {
      continue;
    }
    keys.add(key);
    states.push({
      device_feature_external_id: ids.feature(key),
      state: Math.min(byType.get(type)?.days ?? NONE, MAX_DAYS),
    });
  }
  return states;
}

/**
 * @description The slot of one of our device external ids.
 * @param {object} gladys - SDK client.
 * @param {string} externalId - Device external id.
 * @returns {string|null} The slot number.
 */
export function slotOfDevice(gladys, externalId) {
  const prefix = gladys.externalId(`${DEVICE_TYPE}:`);
  if (!String(externalId).startsWith(prefix)) {
    return null;
  }
  const slot = String(externalId).slice(prefix.length).split(':')[0];
  return slot || null;
}
