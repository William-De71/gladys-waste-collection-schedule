// -----------------------------------------------------------------------------
// Scene triggers.
//
//   collection_tomorrow   the evening before a collection day (reminder time),
//                         once per schedule and day, every waste type joined;
//   waste_type_tomorrow   the same moment, once per waste type (to filter on
//                         one type: "the yellow bin goes out tomorrow");
//   collection_today      the morning of a collection day (morning time);
//   fetch_failed          a schedule could not be updated (on the transition
//                         from working to failing, never in reaction to a
//                         scene action).
//
// A reminder is due from its time and for 3 hours: Gladys restarting at
// 19:30 still reminds the 19:00 collection, once (store.wasFired). Data are
// flat scalars, as the core requires.
// -----------------------------------------------------------------------------

import { truncate } from './i18n.js';
import { typeKey, upcomingDays } from './schedule.js';
import { addDays } from './time.js';

export const TRIGGERS = {
  COLLECTION_TOMORROW: 'collection_tomorrow',
  WASTE_TYPE_TOMORROW: 'waste_type_tomorrow',
  COLLECTION_TODAY: 'collection_today',
  FETCH_FAILED: 'fetch_failed',
};

export const GRACE_MINUTES = 180;

const inWindow = (minutes, target) =>
  target !== null && minutes >= target && minutes < target + GRACE_MINUTES;

/**
 * @description The reminder events due now, not fired yet.
 * @param {object} input - Context.
 * @param {object[]} input.schedules - `[{ slot, name, collections }]`, name a string.
 * @param {{ date: string, minutes: number }} input.clock - Local date and time.
 * @param {{ reminderMinutes: number|null, morningMinutes: number|null }} input.config - Times.
 * @param {Function} input.wasFired - `(key) => boolean`.
 * @returns {{ key: string, trigger: string, data: object }[]} Events to publish.
 */
export function dueReminders({ schedules, clock, config, wasFired }) {
  const events = [];
  const tomorrow = addDays(clock.date, 1);
  for (const schedule of schedules) {
    const days = upcomingDays(schedule.collections ?? [], clock.date);
    const common = { schedule: schedule.slot, schedule_name: truncate(schedule.name, 100) };

    const next = days.find((day) => day.date === tomorrow);
    if (next && inWindow(clock.minutes, config.reminderMinutes)) {
      const key = `${TRIGGERS.COLLECTION_TOMORROW}:${schedule.slot}:${tomorrow}`;
      if (!wasFired(key)) {
        events.push({
          key,
          trigger: TRIGGERS.COLLECTION_TOMORROW,
          data: {
            ...common,
            waste_types: truncate(next.types.join(', '), 1000),
            count: next.types.length,
            date: tomorrow,
          },
        });
      }
      for (const type of next.types) {
        const typeEventKey = `${TRIGGERS.WASTE_TYPE_TOMORROW}:${schedule.slot}:${tomorrow}:${typeKey(type)}`;
        if (!wasFired(typeEventKey)) {
          events.push({
            key: typeEventKey,
            trigger: TRIGGERS.WASTE_TYPE_TOMORROW,
            data: { ...common, waste_type: type, date: tomorrow },
          });
        }
      }
    }

    const current = days.find((day) => day.date === clock.date);
    if (current && inWindow(clock.minutes, config.morningMinutes)) {
      const key = `${TRIGGERS.COLLECTION_TODAY}:${schedule.slot}:${clock.date}`;
      if (!wasFired(key)) {
        events.push({
          key,
          trigger: TRIGGERS.COLLECTION_TODAY,
          data: {
            ...common,
            waste_types: truncate(current.types.join(', '), 1000),
            count: current.types.length,
            date: clock.date,
          },
        });
      }
    }
  }
  return events;
}

/**
 * @description The data of a fetch_failed event.
 * @param {object} schedule - `{ slot, name, source }`, name a string.
 * @param {string} error - The error, in English.
 * @returns {object} Flat data.
 */
export function fetchFailedData(schedule, error) {
  return {
    schedule: schedule.slot,
    schedule_name: truncate(schedule.name, 100),
    source: schedule.source,
    error: truncate(error, 1000),
  };
}
