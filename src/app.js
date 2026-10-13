// -----------------------------------------------------------------------------
// The integration: every Gladys handler, registered before connect().
//
// One image, two integrations of the store. On each connection the container
// asks Gladys for its calendar accounts: a calendar integration gets them, a
// device integration gets 403 (calendar.js). Then:
//   - device mode:   one device per schedule (devices.js), its states;
//   - calendar mode: one calendar per schedule and user (calendar.js);
//   - both:          the `upcoming` widget, the scene triggers and actions,
//                    the configuration buttons.
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
import { createCalendarSync, isCalendarNotAllowed } from './calendar.js';
import { normalizeConfig } from './config.js';
import { buildDevice, buildStates, scheduleName, slotOfDevice } from './devices.js';
import { dueReminders, fetchFailedData, TRIGGERS } from './events.js';
import { pick, t, text, truncate } from './i18n.js';
import { cleanCollections, upcomingDays } from './schedule.js';
import { localClock } from './time.js';
import { ALL, buildUpcomingWidget, relativeDay, WIDGET_ACTIONS, WIDGET_KEY } from './widgets.js';

export const MODES = { DEVICE: 'device', CALENDAR: 'calendar' };
export const ACTIONS = { SEARCH: 'search_source', TEST: 'test_sources' };
export const SCENE_ACTIONS = { REFRESH: 'refresh', NEXT: 'get_next_collection' };

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const TICK_MS = MINUTE;
const RETRY_BASE_MS = 15 * MINUTE;
const STATE_HEARTBEAT_MS = 6 * HOUR;
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
 * @returns {object} `{ start, stop, tick, mode, refresh }`.
 */
export function createApp(
  gladys,
  { bridge, store, now = () => new Date(), timeZone, sleep, logger = sdkLogger },
) {
  let config = normalizeConfig(gladys.config ?? {});
  let mode = null;
  let today = null;
  let timer = null;
  let ticking = null;
  let fetchChain = Promise.resolve();
  let lastDiscovery = null;
  let lastConnection = null;
  let lastWidgetRefresh = 0;
  let pendingWidgetRefresh = null;
  const images = new Map();

  const clock = () => localClock(now(), timeZone);
  const currentDay = () => clock().date;

  // --- Views of the schedules ------------------------------------------------

  const collectionsOf = (slot, day = currentDay()) =>
    cleanCollections(store.slot(slot.slot).raw, config, day);

  const typesOf = (slot) => {
    const types = new Set();
    for (const original of store.slot(slot.slot).knownTypes ?? []) {
      const lower = String(original).toLowerCase();
      if (config.hidden.has(lower)) {
        continue;
      }
      const type = config.renames.get(lower) ?? original;
      if (!config.hidden.has(type.toLowerCase())) {
        types.add(type);
      }
    }
    return [...types].sort((a, b) => a.localeCompare(b));
  };

  /** @param {string} language - Names in that language. */
  const schedulesIn = (language) =>
    config.slots.map((slot) => {
      const record = store.slot(slot.slot);
      return {
        slot: slot.slot,
        name: scheduleName(slot, language),
        source: slot.source,
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

  const errorMessage = (error, slot) => {
    switch (error?.kind) {
      case 'not_found':
      case 'module':
        return t('errorNotFound', { source: slot?.source ?? '' });
      case 'json':
        return t('errorBadJson');
      case 'bad_args':
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
        result = await bridge.fetch(slot.source, slot.args);
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
      logger.info(`schedule ${slot.slot} (${slot.source}): ${raw.length} collections`);
      return store.updateSlot(slot.slot, {
        signature: slot.signature,
        title: typeof result.title === 'string' ? result.title : null,
        fetchedAt: attempt,
        lastAttempt: attempt,
        raw,
        error: null,
        failures: 0,
        knownTypes: [...(before.knownTypes ?? []), ...raw.map((entry) => entry.type)],
      });
    }

    const error = {
      kind: result?.kind ?? 'engine',
      error: truncate(result?.error ?? 'unknown error', 500),
      argument: result?.argument ?? null,
      suggestions: Array.isArray(result?.suggestions) ? result.suggestions.slice(0, 20) : null,
      since: before.error?.since ?? attempt,
    };
    logger.warn(`schedule ${slot.slot} (${slot.source}): ${error.kind}: ${error.error}`);
    // Data fetched with other arguments (another town) are worse than none.
    const sameSource = before.signature === slot.signature;
    const record = store.updateSlot(slot.slot, {
      signature: slot.signature,
      raw: sameSource ? before.raw : [],
      fetchedAt: sameSource ? before.fetchedAt : null,
      knownTypes: sameSource ? before.knownTypes : [],
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
            { ...slot, name: scheduleName(slot, config.language) },
            pick(errorMessage(error, slot), 'en'),
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

  const discoveredDevices = () =>
    config.slots.map((slot) => buildDevice(gladys, slot, typesOf(slot), config.language));

  const publishDiscovery = async (force = false) => {
    const devices = discoveredDevices();
    const key = JSON.stringify(devices);
    if (!force && key === lastDiscovery) {
      return;
    }
    await gladys.publishDiscoveredDevices(devices);
    lastDiscovery = key;
  };

  const publishStates = async () => {
    const day = currentDay();
    const states = [];
    for (const device of gladys.devices ?? []) {
      const slot = config.slots.find((s) => s.slot === slotOfDevice(gladys, device.external_id));
      if (!slot || !store.slot(slot.slot).fetchedAt) {
        continue;
      }
      const created = new Set((device.features ?? []).map((feature) => feature.external_id));
      states.push(
        ...buildStates(
          gladys,
          slot,
          collectionsOf(slot, day),
          typesOf(slot),
          day,
          config.language,
        ).filter((state) => created.has(state.device_feature_external_id)),
      );
    }
    if (states.length > 0) {
      await gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
    }
  };

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
    if (!gladys.connected) {
      return;
    }
    if (mode === MODES.DEVICE) {
      await safely(() => publishDiscovery());
      await safely(() => publishStates());
    } else if (mode === MODES.CALENDAR) {
      await safely(() => calendarSync.syncAll());
    }
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

  const detectMode = async () => {
    try {
      await gladys.getCalendarAccounts();
      return MODES.CALENDAR;
    } catch (error) {
      if (isCalendarNotAllowed(error)) {
        return MODES.DEVICE;
      }
      logger.warn(`cannot tell the integration type yet: ${error.message}`);
      return mode;
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
            if (record.error.argument && record.error.suggestions?.length) {
              line += ` (${text('testSuggestions', language, {
                argument: record.error.argument,
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
      const missing = (result.params ?? [])
        .filter((param) => param.required && !given.has(param.name))
        .map((param) => param.name);
      const item = Object.fromEntries(
        Object.keys(header).map((language) => {
          const more = missing.length
            ? text('searchMore', language, { params: missing.join(', ') })
            : '';
          const line = text('searchItem', language, {
            title: result.title,
            country: result.country,
            module: result.module,
            args: JSON.stringify(result.default_params ?? {}),
            more,
          });
          return [language, result.docs_url ? `${line}\n  ${result.docs_url}` : line];
        }),
      );
      return item;
    });
    return joinMessages([header, ...items]);
  };

  // --- Handlers ------------------------------------------------------------------------

  gladys.on('connected', async () => {
    config = normalizeConfig(gladys.config ?? {});
    dropRemovedSlots();
    mode = await detectMode();
    logger.info(`connected, ${mode ?? 'unknown'} mode, ${config.slots.length} schedule(s)`);
    lastDiscovery = null;
    lastConnection = null;
    calendarSync.forget();
    if (mode === MODES.DEVICE) {
      gladys.forgetPublishedStates();
    }
    await publishAll();
    tick();
  });

  gladys.onScanRequest(async () => {
    if (mode === MODES.DEVICE) {
      await publishDiscovery(true);
    }
    tick();
  });

  gladys.onConfigUpdated(async (raw) => {
    config = normalizeConfig(raw ?? {});
    dropRemovedSlots();
    // Names, renames or schedules changed: publish now, the tick fetches.
    await publishAll();
    tick();
  });

  gladys.onDeviceCreated(async (device) => {
    if (slotOfDevice(gladys, device.external_id) === null) {
      return;
    }
    // States published before the device existed were dropped by Gladys.
    gladys.forgetPublishedStates(device.external_id);
    await publishStates();
    refreshWidget();
  });

  gladys.onCalendarAccountUpdated(async (userSelector) => {
    if (mode === MODES.CALENDAR) {
      await calendarSync.syncUser(userSelector);
    }
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
      error: failed === -1 ? '' : pick(errorMessage(records[failed].error, slots[failed]), 'en'),
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
    get mode() {
      return mode;
    },
    /** For the tests: what the next collection is. */
    nextCollection: (wasteType) => nextCollection(config.slots, wasteType),
    discoveredDevices,
  };
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
