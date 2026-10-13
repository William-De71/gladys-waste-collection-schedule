// -----------------------------------------------------------------------------
// The collections in the Gladys calendar (manifest `type: "calendar"`).
//
// Every user who enabled the integration in "My calendars" gets one calendar
// per schedule ("Waste collection – Home"), with one all-day event per
// collection and waste type. A window covers what is kept (35 days back, 400
// ahead): a collection the source drops disappears from Gladys too. The
// calendars are private when created: the user shares them with the household
// (and the scenes) from "My calendars".
//
// Limits of the core: 500 events per request (larger windows are split), 30
// calendar writes per minute per integration (writes are spaced by 2.1 s).
//
// External ids: ext:<selector>:<user>:schedule-<slot>  (calendar)
//               ext:<selector>:<user>:s<slot>:<date>:<type key>  (event)
// -----------------------------------------------------------------------------

import { text, truncate } from './i18n.js';
import { HISTORY_DAYS, HORIZON_DAYS, typeKey } from './schedule.js';
import { addDays } from './time.js';

export const MAX_EVENTS_PER_REQUEST = 500;
export const WRITE_SPACING_MS = 2100;
const COLOR = '#2e7d32';

/**
 * @description The external id of the calendar of a schedule for a user.
 * @param {object} gladys - SDK client.
 * @param {string} user - User selector.
 * @param {string} slot - Slot number.
 * @returns {string} The external id.
 */
export function calendarId(gladys, user, slot) {
  return gladys.externalId(`${user}:schedule-${slot}`);
}

/**
 * @description The slot of one of our calendar external ids.
 * @param {object} gladys - SDK client.
 * @param {string} user - User selector.
 * @param {string} externalId - Calendar external id.
 * @returns {string|null} The slot.
 */
export function slotOfCalendar(gladys, user, externalId) {
  const prefix = gladys.externalId(`${user}:schedule-`);
  return String(externalId).startsWith(prefix) ? String(externalId).slice(prefix.length) : null;
}

/**
 * @description The events of a schedule for a user.
 * @param {object} gladys - SDK client.
 * @param {string} user - User selector.
 * @param {object} schedule - `{ slot, name, collections }`, name in the user's language.
 * @returns {object[]} Calendar events.
 */
export function buildEvents(gladys, user, schedule) {
  return schedule.collections.map((collection) => ({
    external_id: gladys.externalId(
      `${user}:s${schedule.slot}:${collection.date}:${typeKey(collection.type)}`,
    ),
    name: truncate(collection.type, 200),
    start: collection.date,
    end: addDays(collection.date, 1),
    full_day: true,
    description: truncate(schedule.name, 1000),
  }));
}

/**
 * @description Split the window of a schedule so no request carries more than
 * 500 events (disjoint windows, one request each).
 * @param {object[]} events - Events, all-day, any order.
 * @param {string} from - First day of the window.
 * @param {string} to - Exclusive end of the window.
 * @param {number} [max] - Events per request.
 * @returns {{ from: string, to: string, events: object[] }[]} The requests.
 */
export function splitWindow(events, from, to, max = MAX_EVENTS_PER_REQUEST) {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const chunks = [];
  let current = { from, events: [] };
  for (const event of sorted) {
    if (current.events.length >= max && event.start > current.events.at(-1).start) {
      chunks.push({ ...current, to: event.start });
      current = { from: event.start, events: [] };
    }
    current.events.push(event);
  }
  chunks.push({ ...current, to });
  return chunks;
}

/**
 * @description Create the calendar synchronizer.
 * @param {object} gladys - SDK client.
 * @param {object} options - Dependencies.
 * @param {Function} options.schedules - `(language) => [{ slot, name, collections, title }]`,
 * the configured schedules with data.
 * @param {Function} options.configuredSlots - `() => string[]`.
 * @param {Function} options.today - `() => 'YYYY-MM-DD'`.
 * @param {Function} [options.sleep] - Delay between two writes.
 * @param {object} [options.logger] - SDK logger.
 * @returns {{ syncAll: Function, syncUser: Function, forget: Function }} The synchronizer.
 */
export function createCalendarSync(
  gladys,
  { schedules, configuredSlots, today, sleep = defaultSleep, logger },
) {
  // Last content pushed per calendar: an unchanged calendar is not pushed again.
  const pushed = new Map();
  let lastWrite = 0;
  let queue = Promise.resolve();

  const write = async (call) => {
    const wait = lastWrite + WRITE_SPACING_MS - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
    lastWrite = Date.now();
    return call();
  };

  const syncAccount = async (account, { force = false } = {}) => {
    const user = account.user.selector;
    const language = account.user.language;
    const list = schedules(language);
    const configured = new Set(configuredSlots());

    // Calendars of removed schedules: deleted with their events.
    const existing = await gladys.getCalendars(user);
    for (const calendar of existing) {
      const slot = slotOfCalendar(gladys, user, calendar.external_id);
      if (slot !== null && !configured.has(slot)) {
        await write(() => gladys.deleteCalendar(calendar.external_id));
        pushed.delete(calendar.external_id);
      }
    }
    if (list.length === 0) {
      return;
    }

    const calendars = list.map((schedule) => ({
      external_id: calendarId(gladys, user, schedule.slot),
      name: truncate(text('calendarName', language, { name: schedule.name }), 100),
      description: truncate(
        text('calendarDescription', language, { source: schedule.title || schedule.source }),
        500,
      ),
      color: COLOR,
    }));
    const calendarsKey = JSON.stringify(calendars);
    if (force || pushed.get(`calendars:${user}`) !== calendarsKey) {
      await write(() => gladys.publishCalendars(user, calendars));
      pushed.set(`calendars:${user}`, calendarsKey);
    }

    const skipped = new Set(
      (await gladys.getCalendars(user)).filter((c) => !c.sync).map((c) => c.external_id),
    );
    const from = addDays(today(), -HISTORY_DAYS);
    const to = addDays(today(), HORIZON_DAYS + 1);
    for (const schedule of list) {
      const id = calendarId(gladys, user, schedule.slot);
      if (skipped.has(id)) {
        continue;
      }
      const events = buildEvents(gladys, user, schedule);
      const key = JSON.stringify([from, events]);
      if (!force && pushed.get(id) === key) {
        continue;
      }
      try {
        for (const chunk of splitWindow(events, from, to)) {
          await write(() =>
            gladys.publishCalendarEvents(id, chunk.events, { from: chunk.from, to: chunk.to }),
          );
        }
        pushed.set(id, key);
      } catch (error) {
        // The user turned the sync of this calendar off meanwhile.
        if (error?.status === 403) {
          logger?.info(`calendar ${schedule.slot} of ${user} not synchronized: ${error.message}`);
          continue;
        }
        throw error;
      }
    }
  };

  const enqueue = (job) => {
    const result = queue.then(job);
    queue = result.catch((error) => logger?.warn(`calendar sync failed: ${error.message}`));
    return result;
  };

  return {
    /**
     * @param {object} [options] - `{ force }`: push even what did not change.
     * @returns {Promise<void>} Every enabled user synchronized.
     */
    syncAll: (options) =>
      enqueue(async () => {
        for (const account of await gladys.getCalendarAccounts()) {
          await syncAccount(account, options);
        }
      }),
    /**
     * @param {string} userSelector - The user whose account changed.
     * @returns {Promise<void>} That user synchronized (nothing if disabled).
     */
    syncUser: (userSelector) =>
      enqueue(async () => {
        const account = (await gladys.getCalendarAccounts()).find(
          (candidate) => candidate.user.selector === userSelector,
        );
        if (account) {
          await syncAccount(account, { force: true });
        } else {
          // Disabled: the core already deleted the calendars.
          for (const key of [...pushed.keys()]) {
            if (key.includes(`:${userSelector}:`) || key === `calendars:${userSelector}`) {
              pushed.delete(key);
            }
          }
        }
      }),
    /** Forget what was pushed (reconnection: the core may have changed meanwhile). */
    forget: () => pushed.clear(),
  };
}

/**
 * @param {number} ms - Delay.
 * @returns {Promise<void>} Resolved after the delay.
 */
function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });
}
