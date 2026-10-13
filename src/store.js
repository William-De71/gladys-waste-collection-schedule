// -----------------------------------------------------------------------------
// What the integration remembers between two restarts, in /data/state.json
// (the only writable place of the container):
//   - per schedule slot: the raw collections of the last successful fetch,
//     what they were fetched with, the last error and the waste types ever
//     seen (a device keeps the feature of a seasonal type in winter);
//   - the scene events already fired (a restart at 19:30 does not remind the
//     same collection twice).
// Raw collections are kept before the renames: a new rename applies without
// asking the source again.
// -----------------------------------------------------------------------------

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const VERSION = 1;
const FIRED_KEEP_DAYS = 7;
const MAX_KNOWN_TYPES = 40;

/**
 * @description An empty slot record.
 * @returns {object} The record.
 */
export function emptySlot() {
  return {
    signature: null,
    title: null,
    fetchedAt: null,
    lastAttempt: null,
    raw: [],
    error: null,
    failures: 0,
    knownTypes: [],
  };
}

/**
 * @description Open the state file.
 * @param {string} [path] - The JSON file.
 * @param {object} [logger] - SDK logger.
 * @returns {object} The store.
 */
export function createStore(path = `${process.env.WCS_DATA_DIR || '/data'}/state.json`, logger) {
  let state = { version: VERSION, slots: {}, fired: {} };
  try {
    const loaded = JSON.parse(readFileSync(path, 'utf8'));
    if (loaded?.version === VERSION) {
      state = { version: VERSION, slots: loaded.slots ?? {}, fired: loaded.fired ?? {} };
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger?.warn(`state file unreadable, starting empty: ${error.message}`);
    }
  }

  const save = () => {
    try {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(state));
      renameSync(tmp, path);
    } catch (error) {
      logger?.warn(`cannot save the state file: ${error.message}`);
    }
  };

  return {
    /**
     * @param {string} slot - Slot number.
     * @returns {object} Its record (created empty).
     */
    slot(slot) {
      state.slots[slot] ??= emptySlot();
      return state.slots[slot];
    },
    /**
     * @param {string} slot - Slot number.
     * @param {object} values - Fields to change.
     * @returns {object} The record.
     */
    updateSlot(slot, values) {
      const record = { ...this.slot(slot), ...values };
      if (values.knownTypes) {
        record.knownTypes = [...new Set(values.knownTypes)].slice(-MAX_KNOWN_TYPES);
      }
      state.slots[slot] = record;
      save();
      return record;
    },
    /**
     * @param {string} slot - Slot number, forgotten when it is no longer configured.
     */
    dropSlot(slot) {
      if (state.slots[slot]) {
        delete state.slots[slot];
        save();
      }
    },
    /** @returns {string[]} Slots with a record. */
    slots() {
      return Object.keys(state.slots);
    },
    /**
     * @param {string} key - Event identity.
     * @returns {boolean} Whether it was already fired.
     */
    wasFired(key) {
      return Object.hasOwn(state.fired, key);
    },
    /**
     * @param {string} key - Event identity.
     * @param {string} today - `YYYY-MM-DD`, to forget old entries.
     */
    markFired(key, today) {
      state.fired[key] = today;
      const limit = new Date(Date.parse(`${today}T00:00:00Z`) - FIRED_KEEP_DAYS * 86400000)
        .toISOString()
        .slice(0, 10);
      for (const [other, day] of Object.entries(state.fired)) {
        if (day < limit) {
          delete state.fired[other];
        }
      }
      save();
    },
  };
}
