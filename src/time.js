// -----------------------------------------------------------------------------
// Calendar dates in the timezone of the Gladys instance.
//
// Collections are calendar dates ("2026-10-15"), not instants. "Today" and
// the local time of the reminders depend on the timezone of the house: the
// supervisor injects it as TZ (the timezone of Gladys), passed explicitly
// here so the tests can run any timezone.
// -----------------------------------------------------------------------------

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 3600 * 1000;

/**
 * @description The timezone of the instance.
 * @returns {string|undefined} An IANA name, undefined for the system one.
 */
export function defaultTimeZone() {
  return process.env.TZ || undefined;
}

/**
 * @description The local date and time of an instant in a timezone.
 * @param {Date} now - The instant.
 * @param {string} [timeZone] - IANA timezone.
 * @returns {{ date: string, minutes: number }} `YYYY-MM-DD` and minutes since midnight.
 */
export function localClock(now, timeZone = defaultTimeZone()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/**
 * @description Whether a string is a real calendar date.
 * @param {string} value - The candidate.
 * @returns {boolean} True for `YYYY-MM-DD` of an existing day.
 */
export function isDate(value) {
  const match = DATE.exec(value ?? '');
  if (!match) {
    return false;
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

/**
 * @description Shift a calendar date by a number of days.
 * @param {string} date - `YYYY-MM-DD`.
 * @param {number} days - Days to add (negative to go back).
 * @returns {string} `YYYY-MM-DD`.
 */
export function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * @description Whole days from one calendar date to another.
 * @param {string} from - `YYYY-MM-DD`.
 * @param {string} to - `YYYY-MM-DD`.
 * @returns {number} `to - from`, in days.
 */
export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * @description A calendar date for a widget card. Gladys stores it as
 * midnight UTC and its front shows a date of that exact form as the calendar
 * day itself, without a time and in every timezone (CALENDAR_DATE_REGEX of
 * front/src/components/boxs/external-widget/widgetContentUtils.js, 5.1.1+).
 * Any other instant would be shown with a time.
 * @param {string} date - `YYYY-MM-DD`.
 * @returns {string} ISO 8601 date.
 */
export function displayInstant(date) {
  return `${date}T00:00:00.000Z`;
}

/**
 * @description Parse "HH:MM" into minutes since midnight.
 * @param {string} value - The time.
 * @param {number} fallback - Minutes when the value is not a time.
 * @returns {number} Minutes since midnight.
 */
export function parseTime(value, fallback) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(value ?? '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
}
