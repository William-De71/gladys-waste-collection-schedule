// -----------------------------------------------------------------------------
// Runtime texts, in the four languages of the Gladys UI.
//
// `t(key, vars)` returns a multi-language object `{ en, fr, de, es }` (widgets,
// action results, connection status); `text(key, language, vars)` returns one
// string (device names, calendar names: Gladys does not send the language of
// the user with a scan or a calendar sync, see `language` in config.js).
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

const MESSAGES = {
  scheduleDefaultName: {
    en: 'Schedule {slot}',
    fr: 'Calendrier {slot}',
    de: 'Abfuhrplan {slot}',
    es: 'Calendario {slot}',
  },
  deviceName: {
    en: 'Waste collection {name}',
    fr: 'Collecte des déchets {name}',
    de: 'Müllabfuhr {name}',
    es: 'Recogida de residuos {name}',
  },
  calendarName: {
    en: 'Waste collection – {name}',
    fr: 'Collecte des déchets – {name}',
    de: 'Müllabfuhr – {name}',
    es: 'Recogida de residuos – {name}',
  },
  calendarDescription: {
    en: 'Collection dates from {source}, kept up to date by the Waste Collection Schedule integration.',
    fr: 'Dates de collecte de {source}, tenues à jour par l’intégration Waste Collection Schedule.',
    de: 'Abfuhrtermine von {source}, aktuell gehalten von der Integration Waste Collection Schedule.',
    es: 'Fechas de recogida de {source}, actualizadas por la integración Waste Collection Schedule.',
  },
  featureNextDays: {
    en: 'Next collection (days)',
    fr: 'Prochaine collecte (jours)',
    de: 'Nächste Abholung (Tage)',
    es: 'Próxima recogida (días)',
  },
  featureNextTypes: {
    en: 'Next collection',
    fr: 'Prochaine collecte',
    de: 'Nächste Abholung',
    es: 'Próxima recogida',
  },
  featureTypeDays: {
    en: '{type} (days)',
    fr: '{type} (jours)',
    de: '{type} (Tage)',
    es: '{type} (días)',
  },
  nothingPlanned: {
    en: 'Nothing planned',
    fr: 'Rien de prévu',
    de: 'Nichts geplant',
    es: 'Nada previsto',
  },
  today: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  tomorrow: { en: 'Tomorrow', fr: 'Demain', de: 'Morgen', es: 'Mañana' },
  inDays: { en: 'In {days} d', fr: 'Dans {days} j', de: 'In {days} T.', es: 'En {days} d' },
  inDaysLong: {
    en: 'in {days} days',
    fr: 'dans {days} jours',
    de: 'in {days} Tagen',
    es: 'en {days} días',
  },
  widgetNotConfigured: {
    en: 'No source configured yet. Open the configuration of the integration and fill in a source and its arguments.',
    fr: 'Aucune source configurée. Ouvrez la configuration de l’intégration et renseignez une source et ses arguments.',
    de: 'Noch keine Quelle eingerichtet. Öffnen Sie die Konfiguration der Integration und geben Sie eine Quelle und ihre Argumente an.',
    es: 'Todavía no hay ninguna fuente configurada. Abra la configuración de la integración e indique una fuente y sus argumentos.',
  },
  widgetWaiting: {
    en: 'Waiting for the first update of the collection dates.',
    fr: 'En attente de la première mise à jour des dates de collecte.',
    de: 'Warten auf die erste Aktualisierung der Abfuhrtermine.',
    es: 'Esperando la primera actualización de las fechas de recogida.',
  },
  widgetEmpty: {
    en: 'No upcoming collection in the data of the source.',
    fr: 'Aucune collecte à venir dans les données de la source.',
    de: 'Keine anstehende Abholung in den Daten der Quelle.',
    es: 'No hay recogidas próximas en los datos de la fuente.',
  },
  statusOk: {
    en: '{count} dates',
    fr: '{count} dates',
    de: '{count} Termine',
    es: '{count} fechas',
  },
  statusError: {
    en: 'Update failed',
    fr: 'Échec de mise à jour',
    de: 'Fehlgeschlagen',
    es: 'Error',
  },
  statusPending: { en: 'Pending', fr: 'En attente', de: 'Ausstehend', es: 'Pendiente' },
  buttonRefresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  refreshDone: {
    en: 'Collection dates updated',
    fr: 'Dates de collecte mises à jour',
    de: 'Abfuhrtermine aktualisiert',
    es: 'Fechas de recogida actualizadas',
  },
  refreshFailed: {
    en: 'Update failed: {error}',
    fr: 'Échec de la mise à jour : {error}',
    de: 'Aktualisierung fehlgeschlagen: {error}',
    es: 'Error de actualización: {error}',
  },
  refreshNothing: {
    en: 'No source configured',
    fr: 'Aucune source configurée',
    de: 'Keine Quelle eingerichtet',
    es: 'Ninguna fuente configurada',
  },
  connectionOk: {
    en: '{count} schedule(s) up to date',
    fr: '{count} calendrier(s) à jour',
    de: '{count} Abfuhrplan/-pläne aktuell',
    es: '{count} calendario(s) al día',
  },
  connectionError: {
    en: '{name}: {error}',
    fr: '{name} : {error}',
    de: '{name}: {error}',
    es: '{name}: {error}',
  },
  connectionNone: {
    en: 'No source configured',
    fr: 'Aucune source configurée',
    de: 'Keine Quelle eingerichtet',
    es: 'Ninguna fuente configurada',
  },
  errorNotFound: {
    en: 'unknown source "{source}"',
    fr: 'source « {source} » inconnue',
    de: 'unbekannte Quelle „{source}“',
    es: 'fuente «{source}» desconocida',
  },
  errorBadArgs: {
    en: 'invalid arguments: {error}',
    fr: 'arguments invalides : {error}',
    de: 'ungültige Argumente: {error}',
    es: 'argumentos no válidos: {error}',
  },
  errorBadJson: {
    en: 'the arguments are not a JSON object',
    fr: 'les arguments ne sont pas un objet JSON',
    de: 'die Argumente sind kein JSON-Objekt',
    es: 'los argumentos no son un objeto JSON',
  },
  errorFetch: {
    en: 'the source failed: {error}',
    fr: 'la source a échoué : {error}',
    de: 'die Quelle ist fehlgeschlagen: {error}',
    es: 'la fuente falló: {error}',
  },
  errorTimeout: {
    en: 'the source took too long to answer',
    fr: 'la source a mis trop de temps à répondre',
    de: 'die Quelle hat zu lange gebraucht',
    es: 'la fuente tardó demasiado en responder',
  },
  errorEngine: {
    en: 'the collection engine failed: {error}',
    fr: 'le moteur de collecte a échoué : {error}',
    de: 'die Abfuhr-Engine ist fehlgeschlagen: {error}',
    es: 'el motor de recogida falló: {error}',
  },
  errorEmpty: {
    en: 'the source returned no collection date',
    fr: 'la source n’a renvoyé aucune date de collecte',
    de: 'die Quelle hat keine Abfuhrtermine geliefert',
    es: 'la fuente no devolvió ninguna fecha de recogida',
  },
  searchShort: {
    en: 'Type at least 2 characters: a town, an operator or a country.',
    fr: 'Saisissez au moins 2 caractères : une commune, un organisme ou un pays.',
    de: 'Geben Sie mindestens 2 Zeichen ein: einen Ort, einen Entsorger oder ein Land.',
    es: 'Escriba al menos 2 caracteres: un municipio, un operador o un país.',
  },
  searchNone: {
    en: 'No source matches "{query}". Try the name of your town or of your waste operator, or use the "ics" source with the calendar link of your town hall.',
    fr: 'Aucune source ne correspond à « {query} ». Essayez le nom de votre commune ou de votre organisme de collecte, ou utilisez la source « ics » avec le lien du calendrier de votre mairie.',
    de: 'Keine Quelle passt zu „{query}“. Versuchen Sie den Namen Ihres Ortes oder Ihres Entsorgers, oder nutzen Sie die Quelle „ics“ mit dem Kalenderlink Ihrer Gemeinde.',
    es: 'Ninguna fuente coincide con «{query}». Pruebe con el nombre de su municipio o de su operador de residuos, o use la fuente «ics» con el enlace del calendario de su ayuntamiento.',
  },
  searchHeader: {
    en: '{total} source(s) found, the first {count}:',
    fr: '{total} source(s) trouvée(s), les {count} premières :',
    de: '{total} Quelle(n) gefunden, die ersten {count}:',
    es: '{total} fuente(s) encontrada(s), las {count} primeras:',
  },
  searchHeaderAll: {
    en: '{total} source(s) found:',
    fr: '{total} source(s) trouvée(s) :',
    de: '{total} Quelle(n) gefunden:',
    es: '{total} fuente(s) encontrada(s):',
  },
  searchItem: {
    en: '{title} ({country}) → source: {module} · arguments: {args}{more}',
    fr: '{title} ({country}) → source : {module} · arguments : {args}{more}',
    de: '{title} ({country}) → Quelle: {module} · Argumente: {args}{more}',
    es: '{title} ({country}) → fuente: {module} · argumentos: {args}{more}',
  },
  searchMore: {
    en: ' · to fill in: {params}',
    fr: ' · à compléter : {params}',
    de: ' · zu ergänzen: {params}',
    es: ' · a completar: {params}',
  },
  testNothing: {
    en: 'No source configured: fill in at least the source of schedule 1.',
    fr: 'Aucune source configurée : renseignez au moins la source du calendrier 1.',
    de: 'Keine Quelle eingerichtet: geben Sie mindestens die Quelle von Abfuhrplan 1 an.',
    es: 'Ninguna fuente configurada: indique al menos la fuente del calendario 1.',
  },
  testOk: {
    en: '{name}: OK, {count} dates, {types} type(s): {list}. Next: {next}.',
    fr: '{name} : OK, {count} dates, {types} type(s) : {list}. Prochaine : {next}.',
    de: '{name}: OK, {count} Termine, {types} Art(en): {list}. Nächste: {next}.',
    es: '{name}: OK, {count} fechas, {types} tipo(s): {list}. Próxima: {next}.',
  },
  testError: {
    en: '{name}: ERROR, {error}',
    fr: '{name} : ERREUR, {error}',
    de: '{name}: FEHLER, {error}',
    es: '{name}: ERROR, {error}',
  },
  testSuggestions: {
    en: 'suggestions for "{argument}": {list}',
    fr: 'suggestions pour « {argument} » : {list}',
    de: 'Vorschläge für „{argument}“: {list}',
    es: 'sugerencias para «{argument}»: {list}',
  },
};

/**
 * @description Replace the `{name}` placeholders of a template.
 * @param {string} template - The template.
 * @param {object} vars - The values.
 * @returns {string} The text.
 */
function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] === undefined || vars[name] === null ? match : String(vars[name]),
  );
}

/**
 * @description A runtime text in the four languages.
 * @param {string} key - Message key.
 * @param {object} [vars] - Placeholder values, a value may itself be multi-language.
 * @returns {{en: string, fr: string, de: string, es: string}} The message.
 */
export function t(key, vars = {}) {
  const message = MESSAGES[key];
  if (!message) {
    throw new Error(`Unknown message ${key}`);
  }
  return Object.fromEntries(LANGUAGES.map((language) => [language, text(key, language, vars)]));
}

/**
 * @description A runtime text in one language (English when unknown).
 * @param {string} key - Message key.
 * @param {string} language - Language code.
 * @param {object} [vars] - Placeholder values, a value may itself be multi-language.
 * @returns {string} The text.
 */
export function text(key, language, vars = {}) {
  const message = MESSAGES[key];
  if (!message) {
    throw new Error(`Unknown message ${key}`);
  }
  const lang = LANGUAGES.includes(language) ? language : 'en';
  const resolved = Object.fromEntries(
    Object.entries(vars).map(([name, value]) => [name, pick(value, lang)]),
  );
  return fill(message[lang], resolved);
}

/**
 * @description One language of a value that may be multi-language.
 * @param {*} value - A string, a number or `{ en, fr, ... }`.
 * @param {string} language - Language code.
 * @returns {*} The value in that language.
 */
export function pick(value, language) {
  if (value && typeof value === 'object') {
    return value[language] ?? value.en;
  }
  return value;
}

/**
 * @description Cut a text to a maximum length, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - Maximum length.
 * @returns {string} The text, at most `max` characters.
 */
export function truncate(value, max) {
  const string = String(value ?? '');
  return string.length <= max ? string : `${string.slice(0, max - 1).trimEnd()}…`;
}

/**
 * @description Cut every language of a multi-language text.
 * @param {object} message - `{ en, fr, ... }`.
 * @param {number} max - Maximum length.
 * @returns {object} The message.
 */
export function truncateAll(message, max) {
  return Object.fromEntries(
    Object.entries(message).map(([language, value]) => [language, truncate(value, max)]),
  );
}

export const MESSAGE_KEYS = Object.keys(MESSAGES);
export const MESSAGES_FOR_TESTS = MESSAGES;
