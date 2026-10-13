// -----------------------------------------------------------------------------
// Collection dates: what the sources return, made usable.
//
// A collection is `{ date: 'YYYY-MM-DD', type: 'Recycling', icon }`. The
// renames and the hidden types of the configuration apply to every schedule
// (like the `customize` of Home Assistant). Only a window around today is
// kept: some sources return several years.
// -----------------------------------------------------------------------------

import { addDays, daysBetween, isDate } from './time.js';

export const HISTORY_DAYS = 35;
export const HORIZON_DAYS = 400;
const MAX_TYPE_LENGTH = 60;

/**
 * @description A stable key for a waste type, used in feature external ids.
 * Waste Collection Schedule gives no type identifier: the name is all there
 * is (a source renaming a type therefore gives a new feature).
 * @param {string} type - The waste type, as the source (or a rename) names it.
 * @returns {string} `[a-z0-9_]`, at most 40 characters.
 */
export function typeKey(type) {
  const slug = String(type)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/, '');
  if (slug) {
    return slug;
  }
  // A type written only with characters that do not reduce to ASCII.
  let hash = 0;
  for (const char of String(type)) {
    hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  }
  return `type_${hash.toString(36)}`;
}

/**
 * @description Apply the configuration to the raw collections of a source.
 * @param {object[]} raw - `[{ date, type, icon }]` from the engine.
 * @param {{ renames: Map, hidden: Set }} customize - From config.js.
 * @param {string} today - `YYYY-MM-DD`.
 * @returns {object[]} Valid, renamed, visible, unique collections, by date then type.
 */
export function cleanCollections(raw, { renames, hidden }, today) {
  const from = addDays(today, -HISTORY_DAYS);
  const to = addDays(today, HORIZON_DAYS);
  const seen = new Set();
  const result = [];
  for (const entry of raw ?? []) {
    const original = String(entry?.type ?? '').trim();
    if (!original || !isDate(entry?.date) || entry.date < from || entry.date > to) {
      continue;
    }
    if (hidden.has(original.toLowerCase())) {
      continue;
    }
    const type = (renames.get(original.toLowerCase()) ?? original).slice(0, MAX_TYPE_LENGTH);
    if (hidden.has(type.toLowerCase())) {
      continue;
    }
    const identity = `${entry.date}|${type.toLowerCase()}`;
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    result.push({
      date: entry.date,
      type,
      icon: typeof entry.icon === 'string' ? entry.icon : null,
    });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
}

/**
 * @description The collection days from today on.
 * @param {object[]} collections - Clean collections.
 * @param {string} today - `YYYY-MM-DD`.
 * @returns {{ date: string, days: number, types: string[], icons: (string|null)[] }[]} By date.
 */
export function upcomingDays(collections, today) {
  const days = new Map();
  for (const collection of collections) {
    if (collection.date < today) {
      continue;
    }
    if (!days.has(collection.date)) {
      days.set(collection.date, {
        date: collection.date,
        days: daysBetween(today, collection.date),
        types: [],
        icons: [],
      });
    }
    const day = days.get(collection.date);
    day.types.push(collection.type);
    day.icons.push(collection.icon);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * @description The next collection of each waste type.
 * @param {object[]} collections - Clean collections.
 * @param {string} today - `YYYY-MM-DD`.
 * @returns {Map<string, { date: string, days: number, icon: string|null }>} By type.
 */
export function nextByType(collections, today) {
  const next = new Map();
  for (const collection of collections) {
    if (collection.date < today || next.has(collection.type)) {
      continue;
    }
    next.set(collection.type, {
      date: collection.date,
      days: daysBetween(today, collection.date),
      icon: collection.icon,
    });
  }
  return next;
}

/**
 * @description Every waste type of a list of collections, in a stable order.
 * @param {object[]} collections - Clean collections.
 * @returns {string[]} Types, alphabetical.
 */
export function typesOf(collections) {
  return [...new Set(collections.map((collection) => collection.type))].sort((a, b) =>
    a.localeCompare(b),
  );
}
