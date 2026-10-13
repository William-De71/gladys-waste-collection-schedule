// -----------------------------------------------------------------------------
// Configuration: the values of the config_schema, normalized.
//
// Three schedule slots (`name_<n>`, `source_<n>`, `args_<n>`): a slot is a
// Waste Collection Schedule source and its arguments, exactly what Home
// Assistant users write under `sources:` in YAML. A slot number is the
// identity of its calendar and of its widget filter: changing the
// arguments of a slot (a typo, a move) keeps them.
// -----------------------------------------------------------------------------

import { LANGUAGES } from './i18n.js';
import { parseTime } from './time.js';

export const SLOTS = ['1', '2', '3'];

export const REFRESH_HOURS = ['6', '12', '24'];
export const DEFAULT_REFRESH_HOURS = 12;
export const REMINDER_TIMES = ['16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
export const MORNING_TIMES = ['05:00', '06:00', '07:00', '08:00', '09:00', '10:00'];
export const DEFAULT_REMINDER = '19:00';
export const DEFAULT_MORNING = '06:00';
export const OFF = 'off';

const MODULE = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * @description Parse the arguments of a source: a JSON object, or
 * `key=value` pairs separated by `;` or new lines (values that read as JSON
 * numbers, booleans or null keep that type, everything else is a string).
 * @param {string} raw - The field value.
 * @returns {{ args: object|null, error: string|null }} The arguments, or why not.
 */
export function parseArgs(raw) {
  const value = String(raw ?? '').trim();
  if (value === '') {
    return { args: {}, error: null };
  }
  if (value.startsWith('{')) {
    try {
      const args = JSON.parse(value);
      if (args && typeof args === 'object' && !Array.isArray(args)) {
        return { args, error: null };
      }
    } catch {
      // reported below
    }
    return { args: null, error: 'json' };
  }
  const args = {};
  for (const pair of value.split(/[;\n]/)) {
    if (!pair.trim()) {
      continue;
    }
    const index = pair.indexOf('=');
    if (index <= 0) {
      return { args: null, error: 'json' };
    }
    const key = pair.slice(0, index).trim();
    const text = pair.slice(index + 1).trim();
    args[key] = /^(-?\d+(\.\d+)?|true|false|null)$/.test(text) ? JSON.parse(text) : text;
  }
  return { args, error: null };
}

/**
 * @description Parse a list of `from=to` renames, separated by `;` or new lines.
 * @param {string} raw - The field value.
 * @returns {Map<string, string>} Original waste type (lowercase) -> new name.
 */
export function parseRenames(raw) {
  const renames = new Map();
  for (const pair of String(raw ?? '').split(/[;\n]/)) {
    const index = pair.indexOf('=');
    if (index <= 0) {
      continue;
    }
    const from = pair.slice(0, index).trim();
    const to = pair.slice(index + 1).trim();
    if (from && to) {
      renames.set(from.toLowerCase(), to);
    }
  }
  return renames;
}

/**
 * @description Parse a list of waste types, separated by `;` or new lines.
 * @param {string} raw - The field value.
 * @returns {Set<string>} Waste types, lowercase.
 */
export function parseList(raw) {
  return new Set(
    String(raw ?? '')
      .split(/[;\n]/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * @description Normalize the configuration.
 * @param {object} [raw] - `gladys.config`.
 * @returns {object} The normalized configuration.
 */
export function normalizeConfig(raw = {}) {
  const slots = [];
  for (const slot of SLOTS) {
    const source = String(raw[`source_${slot}`] ?? '').trim();
    if (!source) {
      continue;
    }
    const { args, error } = parseArgs(raw[`args_${slot}`]);
    const name = String(raw[`name_${slot}`] ?? '').trim();
    slots.push({
      slot,
      name: name || null,
      source,
      args,
      // A configuration problem found before calling the engine.
      configError: !MODULE.test(source) ? 'module' : error,
      // What the cached data was fetched with: another value means fetch again.
      signature: JSON.stringify([source, args]),
    });
  }
  const language = LANGUAGES.includes(raw.language) ? raw.language : 'en';
  const refresh = REFRESH_HOURS.includes(String(raw.refresh_hours))
    ? Number(raw.refresh_hours)
    : DEFAULT_REFRESH_HOURS;
  return {
    slots,
    renames: parseRenames(raw.rename),
    hidden: parseList(raw.hide),
    reminderMinutes:
      raw.reminder_time === OFF ? null : parseTime(raw.reminder_time ?? DEFAULT_REMINDER, 19 * 60),
    morningMinutes:
      raw.morning_time === OFF ? null : parseTime(raw.morning_time ?? DEFAULT_MORNING, 6 * 60),
    refreshHours: refresh,
    language,
  };
}
