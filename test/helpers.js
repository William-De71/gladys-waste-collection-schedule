// Shared test doubles: a fake engine, a state file in a temporary folder and a
// clock the tests move by hand. Nothing here touches the network.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createStore } from '../src/store.js';

export const TZ = 'Europe/Paris';

/**
 * @description A fake engine answering like python/bridge.py.
 * @param {object} answers - `source or town -> answer object | (args) => answer`.
 * @returns {object} The bridge, with `calls`.
 */
export function fakeBridge(answers = {}) {
  const calls = [];
  return {
    calls,
    async fetch({ source, country, address = {}, args }) {
      calls.push({ command: 'fetch', source, country, address, args });
      // Keyed by the source, else by the town or the ICS link, like bridge.py finds it.
      const answer = answers[source || address.city || (address.url ? 'ics' : '')];
      if (answer === undefined) {
        return { ok: false, kind: 'not_found', error: `unknown source: ${source}` };
      }
      if (answer instanceof Error) {
        throw answer;
      }
      return typeof answer === 'function' ? answer(args) : structuredClone(answer);
    },
    async search(query, limit) {
      calls.push({ command: 'search', query, limit });
      return answers.__search ?? { ok: true, total: 0, results: [] };
    },
    async version() {
      return { ok: true, version: 'test', sources: 1 };
    },
  };
}

/**
 * @description A store in a fresh temporary folder.
 * @returns {{ store: object, path: string, cleanup: Function }} The store.
 */
export function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), 'wcs-test-'));
  const path = join(dir, 'state.json');
  return {
    store: createStore(path),
    path,
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

/**
 * @description A clock moved by hand.
 * @param {string} iso - Start instant.
 * @returns {{ now: Function, set: Function }} The clock.
 */
export function fakeClock(iso) {
  let current = new Date(iso);
  return {
    now: () => new Date(current),
    set: (value) => {
      current = new Date(value);
    },
  };
}

/**
 * @description Collections of a typical French town, around 2026-10-15.
 * @returns {object[]} Raw collections as the engine returns them.
 */
export function bordeauxCollections() {
  return [
    { date: '2026-10-12', type: 'Ordures ménagères', icon: null },
    { date: '2026-10-16', type: 'Tri sélectif', icon: null },
    { date: '2026-10-16', type: 'Ordures ménagères', icon: null },
    { date: '2026-10-19', type: 'Ordures ménagères', icon: null },
    { date: '2026-10-23', type: 'Verre', icon: 'mdi:bottle-wine' },
    { date: '2026-10-26', type: 'Ordures ménagères', icon: null },
    { date: '2026-10-30', type: 'Tri sélectif', icon: null },
    { date: '2027-01-08', type: 'Sapins de Noël', icon: null },
  ];
}

/** A no-op logger. */
export const silentLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child: () => silentLogger,
};

/** Wait for the pending promises and timers of zero delay. */
export const flush = () => new Promise((resolve) => setImmediate(resolve));
