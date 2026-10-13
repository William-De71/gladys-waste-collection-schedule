// -----------------------------------------------------------------------------
// The `upcoming` dashboard widget: the next collections.
//
//   [tile]   next collection: Today / Tomorrow / In 3 d, its waste types
//   [list]   the next collection days, a bin of the right color each, a badge
//   [status] one line per schedule: dates known, or the update error
//   [button] Refresh (asks the sources again)
//
// Built inline from the cached collections: the widget works even if no user
// enabled the calendars. `buildUpcomingWidget` is a pure function, also used by
// docs/illustrations/gen.mjs for the generated screenshots.
// -----------------------------------------------------------------------------

import { binImageKey, familyOf, FAMILIES } from './bins.js';
import { t, truncate, truncateAll } from './i18n.js';
import { upcomingDays } from './schedule.js';
import { displayInstant } from './time.js';

export const WIDGET_KEY = 'upcoming';
export const WIDGET_ACTIONS = { REFRESH: 'refresh' };
export const ALL = 'all';
export const COUNTS = ['3', '5', '8'];
export const DEFAULT_COUNT = 5;
const TTL_SECONDS = 900;
const TITLE_MAX = 60;

/**
 * @description The relative label of a collection day.
 * @param {number} days - Days from today.
 * @param {boolean} [long] - "in 3 days" rather than "In 3 d".
 * @returns {object} Multi-language label.
 */
export function relativeDay(days, long = false) {
  if (days === 0) {
    return t('today');
  }
  if (days === 1) {
    return t('tomorrow');
  }
  return t(long ? 'inDaysLong' : 'inDays', { days });
}

/**
 * @description The semantic color of a collection day.
 * @param {number} days - Days from today.
 * @returns {string} Widget color.
 */
export function urgencyColor(days) {
  if (days === 0) {
    return 'danger';
  }
  if (days === 1) {
    return 'warning';
  }
  return days <= 7 ? 'info' : 'neutral';
}

/**
 * @description The widget content.
 * @param {object} input - What to show.
 * @param {object[]} input.schedules - `[{ slot, name, collections, error, fetchedAt }]`,
 * the configured schedules, `name` multi-language or a string.
 * @param {string} input.today - `YYYY-MM-DD` in the timezone of the house.
 * @param {object} [input.settings] - Instance settings (`schedule`, `count`, `show_refresh`).
 * @returns {object} The widget content.
 */
export function buildUpcomingWidget({ schedules, today, settings = {} }) {
  if (schedules.length === 0) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', variant: 'body', text: t('widgetNotConfigured') }],
    };
  }
  const selected =
    settings.schedule && settings.schedule !== ALL
      ? schedules.filter((schedule) => schedule.slot === String(settings.schedule))
      : schedules;
  const shown = selected.length > 0 ? selected : schedules;
  const count = COUNTS.includes(String(settings.count)) ? Number(settings.count) : DEFAULT_COUNT;

  const days = shown
    .flatMap((schedule) =>
      upcomingDays(schedule.collections ?? [], today).map((day) => ({ ...day, schedule })),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.schedule.slot.localeCompare(b.schedule.slot))
    .slice(0, count);

  const components = [];
  if (days.length > 0) {
    const first = days[0];
    const sameDay = days.filter((day) => day.date === first.date);
    components.push({
      type: 'value',
      value: truncateAll(relativeDay(first.days), 12),
      label: truncate([...new Set(sameDay.flatMap((day) => day.types))].join(', '), 24),
      icon: 'trash-2',
      color: urgencyColor(first.days),
    });
    components.push({
      type: 'card-list',
      display: 'list',
      items: days.map((day) => {
        const family = dayFamily(day);
        return {
          title: rowTitle(day, shown.length > 1),
          date: displayInstant(day.date),
          image: binImageKey(family),
          badge: {
            text: truncateAll(relativeDay(day.days), 16),
            color: urgencyColor(day.days),
          },
          description: describe(day, shown.length > 1),
        };
      }),
    });
  } else {
    const waiting = shown.every((schedule) => !schedule.fetchedAt);
    components.push({
      type: 'text',
      variant: 'body',
      text: waiting ? t('widgetWaiting') : t('widgetEmpty'),
    });
  }

  components.push({
    type: 'status',
    items: shown.map((schedule) => statusItem(schedule, today)),
  });

  if (settings.show_refresh !== false) {
    components.push({
      type: 'button',
      label: t('buttonRefresh'),
      icon: 'refresh-cw',
      style: 'secondary',
      action: {
        key: WIDGET_ACTIONS.REFRESH,
        params: { schedule: shown.length === schedules.length ? ALL : shown[0].slot },
      },
    });
  }
  return { ttl_seconds: TTL_SECONDS, components };
}

/**
 * @description The bin shown for a collection day: on a day with several
 * waste types, the most telling color (recycling, glass…) rather than grey.
 * @param {{ types: string[], icons: (string|null)[] }} day - Collection day.
 * @returns {string} Family key.
 */
export function dayFamily(day) {
  const families = day.types.map((type, index) => familyOf(type, day.icons[index]));
  return families.find((family) => family !== 'residual' && family !== 'other') ?? families[0];
}

/**
 * @description The title of a list row: the waste types, after the schedule
 * name when several schedules share the list.
 * @param {object} day - Collection day with its schedule.
 * @param {boolean} withName - Several schedules shown.
 * @returns {object|string} Title, at most 60 characters.
 */
function rowTitle(day, withName) {
  const types = day.types.join(', ');
  if (!withName) {
    return truncate(types, TITLE_MAX);
  }
  const name = day.schedule.name;
  if (name && typeof name === 'object') {
    return Object.fromEntries(
      Object.entries(name).map(([language, value]) => [
        language,
        truncate(`${value} · ${types}`, TITLE_MAX),
      ]),
    );
  }
  return truncate(`${name} · ${types}`, TITLE_MAX);
}

/**
 * @description The detail text of a list row.
 * @param {object} day - Collection day with its schedule.
 * @param {boolean} withName - Several schedules shown: name the schedule.
 * @returns {object|string} Multi-language description.
 */
function describe(day, withName) {
  const types = day.types.join(', ');
  if (!withName) {
    return types;
  }
  const name = day.schedule.name;
  if (name && typeof name === 'object') {
    return Object.fromEntries(
      Object.entries(name).map(([language, value]) => [language, `${value}: ${types}`]),
    );
  }
  return `${name}: ${types}`;
}

/**
 * @description The status line of a schedule.
 * @param {object} schedule - Schedule view.
 * @param {string} today - `YYYY-MM-DD`.
 * @returns {object} Status item.
 */
function statusItem(schedule, today) {
  const label = schedule.name;
  if (schedule.error) {
    return { label, value: t('statusError'), color: 'danger' };
  }
  if (!schedule.fetchedAt) {
    return { label, value: t('statusPending'), color: 'neutral' };
  }
  const upcoming = (schedule.collections ?? []).filter((c) => c.date >= today);
  const dates = new Set(upcoming.map((collection) => collection.date)).size;
  return { label, value: t('statusOk', { count: dates }), color: 'success' };
}

export const IMAGE_FAMILIES = Object.keys(FAMILIES);
