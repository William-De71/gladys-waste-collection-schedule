// -----------------------------------------------------------------------------
// The integration: every Gladys handler, registered before connect().
//
// A calendar integration (manifest `type: "calendar"`): one calendar per
// schedule for every user who enabled it (calendar.js), the `upcoming`
// widget, the scene triggers and actions, the configuration buttons.
//
// Each schedule is named after its house of Gladys (`location: true`: the
// names come from GET /house, read at connection and at each configuration
// change, there is no house event).
//
// A one-minute tick drives everything: it fetches the schedules that are due
// (every `refresh_hours`, sooner after a configuration change, with a growing
// delay after a failure), publishes the new day at midnight and fires the
// reminders. The tests drive it with the fake Gladys of the SDK, a fake
// engine and a fake clock (test/app.test.js).
// -----------------------------------------------------------------------------

import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { drawBin, familyOfImageKey } from './bins.js';
import { BridgeError } from './bridge.js';
import { createCalendarSync } from './calendar.js';
import { normalizeConfig } from './config.js';
import { dueReminders, fetchFailedData, TRIGGERS } from './events.js';
import { LANGUAGES, pick, t, text, truncate } from './i18n.js';
import { cleanCollections, scheduleName, upcomingDays } from './schedule.js';
import { localClock } from './time.js';
import { ALL, buildUpcomingWidget, relativeDay, WIDGET_ACTIONS, WIDGET_KEY } from './widgets.js';

export const ACTIONS = { SEARCH: 'search_source', TEST: 'test_sources' };
export const SCENE_ACTIONS = { REFRESH: 'refresh', NEXT: 'get_next_collection' };

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const TICK_MS = MINUTE;
const RETRY_BASE_MS = 15 * MINUTE;
const WIDGET_REFRESH_SPACING_MS = 11 * 1000;
const MAX_RAW = 3000;
const MAX_MESSAGE = 1800;

/**
 * @description Wire the integration.
 * @param {object} gladys - SDK client (or the fake one of the tests).
 * @param {object} deps - Dependencies.
 * @param {object} deps.bridge - Engine client (bridge.js).
 * @param {object} deps.store - State file (store.js).
 * @param {Function} [deps.now] - Clock.
 * @param {string} [deps.timeZone] - Timezone of the house (TZ by default).
 * @param {Function} [deps.sleep] - Delay between calendar writes.
 * @param {object} [deps.logger] - SDK logger.
 * @returns {object} `{ start, stop, tick, refresh, nextCollection }`.
 */
export function createApp(
  gladys,
  { bridge, store, now = () => new Date(), timeZone, sleep, logger = sdkLogger },
) {
  let config = normalizeConfig(gladys.config ?? {});
  let today = null;
  let timer = null;
  let ticking = null;
  let fetchChain = Promise.resolve();
  let lastConnection = null;
  let lastWidgetRefresh = 0;
  let pendingWidgetRefresh = null;
  let houses = [];
  const images = new Map();

  const clock = () => localClock(now(), timeZone);
  const currentDay = () => clock().date;

  // --- Names ----------------------------------------------------------------------

  const loadHouses = async () => {
    try {
      const list = await gladys.getHouses();
      houses = Array.isArray(list) ? list : [];
    } catch (error) {
      // Keep the last known names: a schedule must not lose its name over a glitch.
      logger.warn(`houses: ${error.message}`);
    }
  };

  /** What fetched the dates of a slot, for the messages: the title found, else what the user typed. */
  const sourceLabel = (slot) =>
    store.slot(slot.slot).title || slot.source || slot.address.city || slot.address.url || '';

  /**
   * Name each slot after its house (else its former free name). Two slots of
   * the same house (the town for most bins, an ICS link for glass) get their
   * source in brackets, so the calendars and the widget tell them apart.
   */
  const applyNames = () => {
    for (const slot of config.slots) {
      const house = slot.house && houses.find((candidate) => candidate.selector === slot.house);
      slot.name = house?.name || slot.legacyName || null;
    }
    const counts = new Map();
    for (const slot of config.slots) {
      if (slot.name) {
        counts.set(slot.name, (counts.get(slot.name) ?? 0) + 1);
      }
    }
    for (const slot of config.slots) {
      if (slot.name && counts.get(slot.name) > 1) {
        slot.name = `${slot.name} (${sourceLabel(slot) || slot.slot})`;
      }
    }
  };

  // --- Views of the schedules ------------------------------------------------

  const collectionsOf = (slot, day = currentDay()) =>
    cleanCollections(store.slot(slot.slot).raw, config, day);

  /** @param {string} language - Names in that language. */
  const schedulesIn = (language) =>
    config.slots.map((slot) => {
      const record = store.slot(slot.slot);
      return {
        slot: slot.slot,
        name: scheduleName(slot, language),
        source: sourceLabel(slot),
        title: record.title,
        collections: collectionsOf(slot),
        error: record.error,
        fetchedAt: record.fetchedAt,
      };
    });

  /** Names in the four languages, for the widget (cached per language by Gladys). */
  const schedulesMulti = () =>
    config.slots.map((slot) => {
      const record = store.slot(slot.slot);
      return {
        slot: slot.slot,
        name: slot.name || t('scheduleDefaultName', { slot: slot.slot }),
        collections: collectionsOf(slot),
        error: record.error,
        fetchedAt: record.fetchedAt,
      };
    });

  /** The name of a parameter as the form shows it, else as the source names it. */
  const paramLabel = (param) => {
    const key = FIELD_MESSAGES[param.field];
    if (key) {
      return t(key);
    }
    const label = param.label ?? { en: param.name };
    return t('fieldAdvanced', { label, name: param.name });
  };

  const errorMessage = (error, slot) => {
    switch (error?.kind) {
      case 'not_found':
        return t('errorNotFound', { source: slot?.source ?? '' });
      case 'json':
        return t('errorBadJson');
      case 'no_source':
        return error.query ? t('errorNoSource', { query: error.query }) : t('errorNoTown');
      case 'ambiguous':
        return t('errorAmbiguous', {
          query: error.query ?? '',
          list: (error.suggestions ?? []).join(', '),
        });
      case 'missing':
        return joinWith((error.missing ?? []).map(paramLabel), ', ', (list) =>
          t('errorMissing', { source: slot ? sourceLabel(slot) : '', list }),
        );
      case 'bad_args':
        if (error.field || error.label) {
          return t('errorValue', {
            field: FIELD_MESSAGES[error.field] ? t(FIELD_MESSAGES[error.field]) : error.label,
            error: error.error,
          });
        }
        return t('errorBadArgs', { error: error.error });
      case 'timeout':
        return t('errorTimeout');
      case 'engine':
        return t('errorEngine', { error: error.error });
      case 'empty':
        return t('errorEmpty');
      default:
        return t('errorFetch', { error: error?.error ?? '' });
    }
  };

  // --- Fetching ----------------------------------------------------------------

  const fetchSlot = async (slot, { fromSceneAction = false } = {}) => {
    const before = store.slot(slot.slot);
    const attempt = now().getTime();
    let result;
    if (slot.configError) {
      result = { ok: false, kind: slot.configError, error: slot.configError };
    } else {
      try {
        result = await bridge.fetch({
          source: slot.source,
          country: slot.country,
          address: slot.address,
          args: slot.args,
        });
      } catch (error) {
        result = {
          ok: false,
          kind: error instanceof BridgeError ? error.kind : 'engine',
          error: error.message,
        };
      }
      if (result?.ok && (result.collections ?? []).length === 0) {
        result = { ok: false, kind: 'empty', error: 'no collection date' };
      }
    }

    if (result?.ok) {
      const raw = result.collections.slice(0, MAX_RAW);
      logger.info(
        `schedule ${slot.slot} (${result.module ?? slot.source}): ${raw.length} collections`,
      );
      return store.updateSlot(slot.slot, {
        signature: slot.signature,
        title: typeof result.title === 'string' ? result.title : null,
        fetchedAt: attempt,
        lastAttempt: attempt,
        raw,
        error: null,
        failures: 0,
      });
    }

    const error = {
      kind: result?.kind ?? 'engine',
      error: truncate(result?.error ?? 'unknown error', 500),
      argument: result?.argument ?? null,
      field: result?.field ?? null,
      label: result?.label ?? null,
      query: result?.query ?? null,
      missing: Array.isArray(result?.missing) ? result.missing.slice(0, 10) : null,
      suggestions: Array.isArray(result?.suggestions) ? result.suggestions.slice(0, 20) : null,
      since: before.error?.since ?? attempt,
    };
    logger.warn(`schedule ${slot.slot} (${sourceLabel(slot)}): ${error.kind}: ${error.error}`);
    // Data fetched with other arguments (another town) are worse than none.
    const sameSource = before.signature === slot.signature;
    const record = store.updateSlot(slot.slot, {
      signature: slot.signature,
      raw: sameSource ? before.raw : [],
      fetchedAt: sameSource ? before.fetchedAt : null,
      lastAttempt: attempt,
      error,
      failures: (before.failures ?? 0) + 1,
    });
    // A transition, never a consequence of a scene action (loop risk).
    if (!before.error && !fromSceneAction) {
      await safely(() =>
        gladys.publishSceneEvent(
          TRIGGERS.FETCH_FAILED,
          fetchFailedData(
            { ...slot, name: scheduleName(slot, config.language), source: sourceLabel(slot) },
            pick(errorMessage(error, slot), config.language),
          ),
        ),
      );
    }
    return record;
  };

  /** Fetch some slots, one after the other, then publish what changed. */
  const refresh = (slots, options = {}) => {
    const run = fetchChain.then(async () => {
      const records = [];
      for (const slot of slots) {
        records.push(await fetchSlot(slot, options));
      }
      await publishAll();
      return records;
    });
    fetchChain = run.catch(() => {});
    return run;
  };

  const isDue = (slot) => {
    const record = store.slot(slot.slot);
    const at = now().getTime();
    if (record.signature !== slot.signature || !record.lastAttempt) {
      return true;
    }
    const period = config.refreshHours * HOUR;
    if (record.error) {
      const delay = Math.min(RETRY_BASE_MS * 2 ** Math.max(0, record.failures - 1), period);
      return at - record.lastAttempt >= delay;
    }
    return at - (record.fetchedAt ?? 0) >= period;
  };

  // --- Publishing --------------------------------------------------------------

  const calendarSync = createCalendarSync(gladys, {
    schedules: (language) =>
      schedulesIn(language).filter((schedule) => store.slot(schedule.slot).fetchedAt),
    configuredSlots: () => config.slots.map((slot) => slot.slot),
    today: currentDay,
    sleep,
    logger,
  });

  const refreshWidget = () => {
    const wait = lastWidgetRefresh + WIDGET_REFRESH_SPACING_MS - Date.now();
    if (wait <= 0) {
      lastWidgetRefresh = Date.now();
      safely(() => gladys.requestWidgetRefresh(WIDGET_KEY));
      return;
    }
    if (!pendingWidgetRefresh) {
      pendingWidgetRefresh = setTimeout(() => {
        pendingWidgetRefresh = null;
        refreshWidget();
      }, wait);
      pendingWidgetRefresh.unref?.();
    }
  };

  const publishConnection = async () => {
    let status;
    if (config.slots.length === 0) {
      status = { connected: false, message: t('connectionNone') };
    } else {
      const failing = config.slots.find((slot) => store.slot(slot.slot).error);
      status = failing
        ? {
            connected: false,
            message: Object.fromEntries(
              Object.entries(errorMessage(store.slot(failing.slot).error, failing)).map(
                ([language, message]) => [
                  language,
                  truncate(
                    text('connectionError', language, {
                      name: scheduleName(failing, language),
                      error: message,
                    }),
                    200,
                  ),
                ],
              ),
            ),
          }
        : { connected: true, message: t('connectionOk', { count: config.slots.length }) };
    }
    const key = JSON.stringify(status);
    if (key !== lastConnection) {
      await gladys.setConnectionStatus(status.connected, status.message);
      lastConnection = key;
    }
  };

  const publishAll = async () => {
    // A fetch may have found the title that tells two slots of one house apart.
    applyNames();
    if (!gladys.connected) {
      return;
    }
    await safely(() => calendarSync.syncAll());
    await safely(() => publishConnection());
    refreshWidget();
  };

  const safely = async (call) => {
    try {
      return await call();
    } catch (error) {
      logger.warn(error.message);
      return undefined;
    }
  };

  // --- The tick ------------------------------------------------------------------

  const runTick = async () => {
    const day = currentDay();
    const dayChanged = day !== today;
    today = day;
    const due = config.slots.filter(isDue);
    if (due.length > 0) {
      await refresh(due);
    } else if (dayChanged) {
      await publishAll();
    }
    if (!gladys.connected) {
      return;
    }
    const events = dueReminders({
      schedules: schedulesIn(config.language),
      clock: clock(),
      config,
      wasFired: (key) => store.wasFired(key),
    });
    for (const event of events) {
      await safely(() => gladys.publishSceneEvent(event.trigger, event.data));
      store.markFired(event.key, day);
    }
  };

  /** One tick at a time: a slow source never stacks ticks. */
  const tick = () => {
    if (!ticking) {
      ticking = runTick()
        .catch((error) => logger.warn(`tick failed: ${error.message}`))
        .finally(() => {
          ticking = null;
        });
    }
    return ticking;
  };

  const dropRemovedSlots = () => {
    const configured = new Set(config.slots.map((slot) => slot.slot));
    for (const slot of store.slots()) {
      if (!configured.has(slot)) {
        store.dropSlot(slot);
      }
    }
  };

  // --- Messages of the configuration buttons and of the scene actions -------------

  const slotsFor = (schedule) =>
    !schedule || schedule === ALL
      ? config.slots
      : config.slots.filter((slot) => slot.slot === String(schedule));

  const testMessage = (records, slots) => {
    if (slots.length === 0) {
      return t('testNothing');
    }
    const day = currentDay();
    const lines = slots.map((slot, index) => {
      const record = records[index];
      return Object.fromEntries(
        Object.keys(t('testNothing')).map((language) => {
          const name = scheduleName(slot, language);
          if (record.error) {
            let line = text('testError', language, {
              name,
              error: errorMessage(record.error, slot),
            });
            if (
              record.error.kind === 'bad_args' &&
              record.error.argument &&
              record.error.suggestions?.length
            ) {
              const field = FIELD_MESSAGES[record.error.field];
              line += ` (${text('testSuggestions', language, {
                argument: field
                  ? text(field, language)
                  : (pick(record.error.label, language) ?? record.error.argument),
                list: record.error.suggestions.slice(0, 10).join(', '),
              })})`;
            }
            return [language, line];
          }
          const collections = collectionsOf(slot, day).filter((c) => c.date >= day);
          const types = [...new Set(collections.map((c) => c.type))].sort((a, b) =>
            a.localeCompare(b),
          );
          const [next] = upcomingDays(collections, day);
          return [
            language,
            text('testOk', language, {
              name,
              count: new Set(collections.map((c) => c.date)).size,
              types: types.length,
              list: truncate(types.join(', '), 300),
              next: next
                ? `${next.types.join(', ')}, ${next.date} (${pick(relativeDay(next.days, true), language)})`
                : text('nothingPlanned', language),
            }),
          ];
        }),
      );
    });
    return joinMessages(lines);
  };

  const searchMessage = (query, answer) => {
    if (!answer?.ok) {
      if (answer?.kind === 'request') {
        return t('searchShort');
      }
      throw new Error(answer?.error ?? 'search failed');
    }
    if (answer.results.length === 0) {
      return t('searchNone', { query });
    }
    const header =
      answer.total > answer.results.length
        ? t('searchHeader', { total: answer.total, count: answer.results.length })
        : t('searchHeaderAll', { total: answer.total });
    const items = answer.results.map((result) => {
      const given = new Set(Object.keys(result.default_params ?? {}));
      const params = (result.params ?? []).filter((param) => !given.has(param.name));
      // Several parameters may be one field (street and street_name): once.
      const labels = (required) => {
        const seen = new Set();
        return params
          .filter((param) => param.required === required)
          .map(paramLabel)
          .filter((label) => !seen.has(label.en) && seen.add(label.en));
      };
      const required = labels(true);
      const optional = labels(false);
      return Object.fromEntries(
        Object.keys(header).map((language) => {
          const list = (labels) => labels.map((label) => pick(label, language)).join(', ');
          const line = text('searchItem', language, {
            title: result.title,
            country: result.country,
            required: required.length
              ? text('searchRequired', language, { params: list(required) })
              : '',
            optional: optional.length
              ? text('searchOptional', language, { params: list(optional) })
              : '',
          });
          return [language, result.docs_url ? `${line}\n  ${result.docs_url}` : line];
        }),
      );
    });
    return joinMessages([header, ...items, t('searchHint')]);
  };

  // --- Handlers ------------------------------------------------------------------------

  gladys.on('connected', async () => {
    config = normalizeConfig(gladys.config ?? {});
    dropRemovedSlots();
    await loadHouses();
    logger.info(`connected, ${config.slots.length} schedule(s)`);
    lastConnection = null;
    // Calendars may have changed while disconnected: push everything again.
    calendarSync.forget();
    await publishAll();
    tick();
  });

  gladys.onConfigUpdated(async (raw) => {
    config = normalizeConfig(raw ?? {});
    dropRemovedSlots();
    // A house may have been added or renamed since the connection.
    await loadHouses();
    // Names, renames or schedules changed: publish now, the tick fetches.
    await publishAll();
    tick();
  });

  gladys.onCalendarAccountUpdated(async (userSelector) => {
    await calendarSync.syncUser(userSelector);
  });

  gladys.onWidgetGet(WIDGET_KEY, async ({ settings }) =>
    buildUpcomingWidget({ schedules: schedulesMulti(), today: currentDay(), settings }),
  );

  gladys.onWidgetGetImage(async (key) => {
    const family = familyOfImageKey(key);
    if (!family) {
      throw new Error(`unknown image ${key}`);
    }
    if (!images.has(family)) {
      images.set(family, drawBin(family));
    }
    return images.get(family);
  });

  gladys.onWidgetAction(WIDGET_KEY, async (actionKey, params) => {
    if (actionKey !== WIDGET_ACTIONS.REFRESH) {
      throw new Error(`unknown action ${actionKey}`);
    }
    const slots = slotsFor(params?.schedule);
    if (slots.length === 0) {
      return t('refreshNothing');
    }
    const records = await refresh(slots);
    const failed = records.findIndex((record) => record.error);
    if (failed === -1) {
      return t('refreshDone');
    }
    return t('refreshFailed', {
      error: errorMessage(records[failed].error, slots[failed]),
    });
  });

  gladys.onAction(ACTIONS.SEARCH, async (fields) => {
    const query = String(fields?.query ?? '').trim();
    if (query.length < 2) {
      return t('searchShort');
    }
    return searchMessage(query, await bridge.search(query, 6));
  });

  gladys.onAction(ACTIONS.TEST, async () => {
    const slots = config.slots;
    const records = slots.length > 0 ? await refresh(slots) : [];
    return testMessage(records, slots);
  });

  gladys.onSceneAction(SCENE_ACTIONS.REFRESH, async (fields) => {
    const slots = slotsFor(fields?.schedule);
    if (slots.length === 0) {
      return { success: false, error: 'no schedule configured' };
    }
    const records = await refresh(slots, { fromSceneAction: true });
    const failed = records.findIndex((record) => record.error);
    const next = nextCollection(slots);
    return {
      success: failed === -1,
      error:
        failed === -1
          ? ''
          : pick(errorMessage(records[failed].error, slots[failed]), config.language),
      next_date: next?.date ?? '',
      next_waste_types: next?.types.join(', ') ?? '',
      days: next?.days ?? -1,
    };
  });

  gladys.onSceneAction(SCENE_ACTIONS.NEXT, async (fields) => {
    const next = nextCollection(slotsFor(fields?.schedule), fields?.waste_type);
    if (!next) {
      return { found: false, date: '', days: -1, waste_types: '', schedule_name: '' };
    }
    return {
      found: true,
      date: next.date,
      days: next.days,
      waste_types: next.types.join(', '),
      schedule_name: next.names.join(', '),
    };
  });

  /**
   * @description The next collection day among some schedules.
   * @param {object[]} slots - Slots.
   * @param {string} [wasteType] - Only the types containing this text.
   * @returns {object|null} `{ date, days, types, names }`.
   */
  const nextCollection = (slots, wasteType) => {
    const day = currentDay();
    const filter = String(wasteType ?? '')
      .trim()
      .toLowerCase();
    let best = null;
    for (const slot of slots) {
      let collections = collectionsOf(slot, day);
      if (filter) {
        collections = collections.filter((c) => c.type.toLowerCase().includes(filter));
      }
      const [next] = upcomingDays(collections, day);
      if (!next) {
        continue;
      }
      const name = scheduleName(slot, config.language);
      if (!best || next.date < best.date) {
        best = { date: next.date, days: next.days, types: [...next.types], names: [name] };
      } else if (next.date === best.date) {
        best.types.push(...next.types.filter((type) => !best.types.includes(type)));
        best.names.push(name);
      }
    }
    return best;
  };

  return {
    /** Start the one-minute tick (after connect). */
    start() {
      timer ??= setInterval(tick, TICK_MS);
      timer.unref?.();
    },
    /** Stop the timers (shutdown). */
    stop() {
      clearInterval(timer);
      timer = null;
      clearTimeout(pendingWidgetRefresh);
      pendingWidgetRefresh = null;
    },
    tick,
    refresh: (options) => refresh(config.slots, options),
    /** For the tests: what the next collection is. */
    nextCollection: (wasteType) => nextCollection(config.slots, wasteType),
  };
}

// The form field of each kind of parameter (python/bridge.py FIELD_PARAMS).
const FIELD_MESSAGES = {
  city: 'fieldCity',
  postcode: 'fieldPostcode',
  street: 'fieldStreet',
  number: 'fieldNumber',
  address: 'fieldAddress',
  url: 'fieldUrl',
  insee: 'fieldInsee',
};

/**
 * @description Join multi-language parts into one, then wrap it in a message.
 * @param {object[]} parts - `{ en, fr, ... }` objects.
 * @param {string} separator - Between two parts.
 * @param {Function} wrap - `(joined) => message`.
 * @returns {object} The message.
 */
function joinWith(parts, separator, wrap) {
  const joined = Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      parts.map((part) => pick(part, language)).join(separator),
    ]),
  );
  return wrap(joined);
}

/**
 * @description Join multi-language messages line by line.
 * @param {object[]} messages - `{ en, fr, ... }` objects.
 * @returns {object} One message.
 */
function joinMessages(messages) {
  const languages = Object.keys(messages[0]);
  return Object.fromEntries(
    languages.map((language) => [
      language,
      truncate(messages.map((message) => message[language] ?? message.en).join('\n'), MAX_MESSAGE),
    ]),
  );
}

export { HOUR, MINUTE };
