// python/bridge.py for real, against a stand-in of the waste_collection_schedule
// package (test/fixtures/python-lib): the protocol, the error kinds, the
// search, the address mapping, the INSEE lookup (a local server). Skipped where no python3 is installed. No network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BridgeError, createBridge } from '../src/bridge.js';

const python = spawnSync('python3', ['--version']).status === 0 ? 'python3' : null;
const libDir = fileURLToPath(new URL('./fixtures/python-lib', import.meta.url));
const skip = python ? false : 'python3 is not installed';

/**
 * @description A bridge on the fixture library, with a temporary data folder.
 * @returns {{ bridge: object, cleanup: Function }} The bridge.
 */
function fixtureBridge() {
  const dataDir = mkdtempSync(join(tmpdir(), 'wcs-bridge-'));
  return {
    bridge: createBridge({ python: python ?? 'python3', libDir, dataDir }),
    cleanup: () => rmSync(dataDir, { recursive: true, force: true }),
  };
}

test(
  'fetch: collections with ISO dates, trimmed types, empty types dropped',
  { skip },
  async () => {
    const { bridge, cleanup } = fixtureBridge();
    try {
      const answer = await bridge.fetch({ source: 'fake_town', args: { city: 'Springfield' } });
      assert.deepEqual(answer, {
        ok: true,
        title: 'Fake Town',
        module: 'fake_town',
        collections: [
          { date: '2026-10-16', type: 'Recycling', icon: 'mdi:recycle' },
          { date: '2026-10-19', type: 'Residual', icon: null },
        ],
      });
    } finally {
      cleanup();
    }
  },
);

test('fetch: error kinds', { skip }, async () => {
  const { bridge, cleanup } = fixtureBridge();
  const fetch = (source, args = {}) => bridge.fetch({ source, args });
  try {
    // Not a module: searched as a title, found nowhere.
    assert.deepEqual(await fetch('nope'), {
      ok: false,
      kind: 'no_source',
      error: 'no source for nope',
      query: 'nope',
    });
    assert.equal((await fetch('../etc/passwd')).kind, 'no_source');
    assert.equal((await fetch('broken')).kind, 'not_found');
    assert.equal((await bridge.fetch({})).kind, 'no_source');
    const missing = await fetch('fake_town');
    assert.equal(missing.kind, 'missing');
    assert.deepEqual(missing.missing, [{ name: 'city', field: 'city', label: null }]);
    assert.equal((await fetch('fake_town', { city: 'x', town: 'x' })).kind, 'bad_args');
    const unknown = await fetch('fake_town', { city: 'Capital City' });
    assert.deepEqual(unknown, {
      ok: false,
      kind: 'bad_args',
      error: "city 'Capital City' not found",
      argument: 'city',
      field: 'city',
      suggestions: ['Springfield', 'Shelbyville'],
    });
    const down = await fetch('fake_town', { city: 'Springfield', fail: true });
    assert.deepEqual(down, { ok: false, kind: 'fetch', error: 'ConnectionError: server down' });
    assert.equal((await bridge.request({ command: 'nope' })).kind, 'request');
  } finally {
    cleanup();
  }
});

test(
  'fetch: the source found from the town or the title, in the chosen country',
  { skip },
  async () => {
    const { bridge, cleanup } = fixtureBridge();
    const typesOf = async (query) => {
      const answer = await bridge.fetch(query);
      assert.equal(answer.ok, true, JSON.stringify(answer));
      return { title: answer.title, module: answer.module, type: answer.collections[0].type };
    };
    try {
      // The town alone, its entry gives the defaults.
      assert.deepEqual(await typesOf({ country: 'Neverland', address: { city: 'Shelbyville' } }), {
        title: 'Shelbyville',
        module: 'fake_town',
        type: 'Recycling',
      });
      // The same title in two countries: the country decides, none is a tie.
      const tie = await bridge.fetch({ address: { city: 'Fakeville' } });
      assert.equal(tie.kind, 'ambiguous');
      assert.deepEqual(tie.suggestions, ['Fakeville (France)', 'Fakeville (Neverland)']);
      // The exact title wins over the titles starting with it (Fakeville Sud).
      assert.deepEqual(
        await typesOf({
          country: 'France',
          address: { city: 'Fakeville', street: 'Rue Haute' },
          args: { insee_code: '99001' },
        }),
        {
          title: 'Fakeville',
          module: 'fake_metropole_fr',
          type: 'insee_code=99001;street=Rue Haute;zone=north',
        },
      );
      // A town absent from the titles: the operator goes in Source.
      assert.equal(
        (await bridge.fetch({ country: 'France', address: { city: 'Amagney' } })).kind,
        'no_source',
      );
      // An ICS link alone is the ics source.
      const ics = await bridge.fetch({ address: { url: 'https://example.org/a.ics' } });
      assert.equal(ics.kind, 'not_found', 'no ics module in the fixture library');
      assert.match(ics.error, /ics/);
    } finally {
      cleanup();
    }
  },
);

test(
  'fetch: the address goes to the parameters of the source, the advanced ones win',
  { skip },
  async () => {
    const { bridge, cleanup } = fixtureBridge();
    try {
      const answer = await bridge.fetch({
        source: 'Fake Métropole',
        address: { city: '25056', street: 'Rue Haute', number: '3', postcode: '25000' },
        args: { zone: 'east', extra: 'kept' },
      });
      assert.equal(
        answer.collections[0].type,
        'extra=kept;house_number=3;insee_code=25056;street=Rue Haute;zone=east',
      );
      // What is missing, with the labels of the source and the form field.
      const missing = await bridge.fetch({ source: 'fake_metropole_fr', address: {} });
      assert.deepEqual(missing.missing, [
        { name: 'insee_code', field: 'insee', label: { en: 'INSEE Code', fr: 'Code INSEE' } },
        { name: 'street', field: 'street', label: { en: 'Street', fr: 'Rue' } },
      ]);
    } finally {
      cleanup();
    }
  },
);

test(
  'fetch: the INSEE code from the town and its postcode, the street never sent',
  { skip },
  async () => {
    const requests = [];
    const server = createServer((request, response) => {
      const url = new URL(request.url, 'http://localhost');
      requests.push(url);
      const towns = {
        Besançon: [{ nom: 'Besançon', code: '25056', codesPostaux: ['25000'] }],
        Saint: [
          { nom: 'Saint-Vit', code: '25527', codesPostaux: ['25410'] },
          { nom: 'Saint-Hippolyte', code: '25519', codesPostaux: ['25190'] },
        ],
      };
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(towns[url.searchParams.get('nom')] ?? []));
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    process.env.WCS_GEO_API = `http://127.0.0.1:${server.address().port}`;
    const { bridge, cleanup } = fixtureBridge();
    const fetch = (city) =>
      bridge.fetch({
        source: 'fake_metropole_fr',
        address: { city, postcode: '25000', street: 'Rue Haute' },
      });
    try {
      const found = await fetch('Besançon');
      assert.equal(found.collections[0].type, 'insee_code=25056;street=Rue Haute');
      assert.equal(requests[0].pathname, '/communes');
      assert.equal(requests[0].searchParams.get('nom'), 'Besançon');
      assert.equal(requests[0].searchParams.get('codePostal'), '25000');
      assert.ok(![...requests[0].searchParams.values()].includes('Rue Haute'));
      const several = await fetch('Saint');
      assert.equal(several.kind, 'bad_args');
      assert.equal(several.field, 'city');
      assert.deepEqual(several.suggestions, ['Saint-Vit (25410)', 'Saint-Hippolyte (25190)']);
      assert.equal((await fetch('Nowhere')).kind, 'bad_args');
    } finally {
      delete process.env.WCS_GEO_API;
      cleanup();
      server.close();
    }
  },
);

test('search: by title, accents ignored, parameters read from the source', { skip }, async () => {
  const { bridge, cleanup } = fixtureBridge();
  try {
    const answer = await bridge.search('springfield');
    assert.equal(answer.total, 2);
    assert.deepEqual(answer.results[0], {
      title: 'Springfield',
      country: 'Neverland',
      module: 'fake_town',
      default_params: { city: 'Springfield' },
      params: [
        { name: 'city', required: true, field: 'city', label: null },
        { name: 'street', required: false, field: 'street', label: null },
        { name: 'fail', required: false, field: null, label: null },
      ],
      docs_url: 'https://example.org/fake_town.md',
    });
    const [metropole] = (await bridge.search('fake metropole')).results;
    assert.deepEqual(
      metropole.params.map((param) => [param.name, param.field, param.label?.fr ?? null]),
      [
        ['insee_code', 'insee', 'Code INSEE'],
        ['street', 'street', 'Rue'],
        ['house_number', 'number', null],
        ['zone', null, 'Secteur'],
      ],
    );
    assert.equal((await bridge.search('NÉVERLAND shelby')).total, 1);
    assert.equal((await bridge.search('x')).kind, 'request');
    assert.deepEqual(await bridge.version(), { ok: true, version: '9.9.9', sources: 4 });
  } finally {
    cleanup();
  }
});

/**
 * @description A fake child process for the Node side of the bridge.
 * @param {Function} behave - `(child, payload) => void`, drives the streams.
 * @returns {{ spawn: Function, spawned: object[] }} The fake spawn.
 */
function fakeSpawn(behave) {
  const spawned = [];
  const spawn = (command, args, options) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.stderr.setEncoding = () => {};
    child.killed = null;
    child.kill = (signal) => {
      child.killed = signal;
      child.emit('close', null, signal);
    };
    let input = '';
    child.stdin = new EventEmitter();
    child.stdin.end = (data) => {
      input += data;
      setImmediate(() => behave(child, JSON.parse(input)));
    };
    spawned.push({ command, args, env: options.env, child });
    return child;
  };
  return { spawn, spawned };
}

test('the engine gets a minimal environment, never the Gladys token', async () => {
  process.env.GLADYS_INTEGRATION_TOKEN = 'secret-token';
  const { spawn, spawned } = fakeSpawn((child) => {
    child.stdout.emit('data', '{"ok": true, "version": "x", "sources": 1}\n');
    child.emit('close', 0, null);
  });
  const dataDir = mkdtempSync(join(tmpdir(), 'wcs-bridge-'));
  try {
    const bridge = createBridge({
      python: 'py',
      script: 'bridge.py',
      libDir: '/lib',
      dataDir,
      spawn,
    });
    await bridge.version();
    const { command, args, env } = spawned[0];
    assert.equal(command, 'py');
    assert.deepEqual(args, ['-I', 'bridge.py']);
    assert.equal(env.GLADYS_INTEGRATION_TOKEN, undefined);
    assert.equal(env.TMPDIR, `${dataDir}/tmp`);
    assert.equal(env.WCS_LIB_DIR, '/lib');
  } finally {
    delete process.env.GLADYS_INTEGRATION_TOKEN;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('one process at a time, a crash and a timeout are errors', async () => {
  let running = 0;
  let maxRunning = 0;
  const { spawn } = fakeSpawn((child, payload) => {
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    if (payload.source === 'hang') {
      return; // killed by the timeout
    }
    setTimeout(() => {
      running -= 1;
      if (payload.source === 'crash') {
        child.stderr.emit('data', 'Traceback...\nMemoryError\n');
        child.emit('close', 1, null);
        return;
      }
      child.stdout.emit('data', '{"ok": true, "collections": []}\n');
      child.emit('close', 0, null);
    }, 5);
  });
  const dataDir = mkdtempSync(join(tmpdir(), 'wcs-bridge-'));
  try {
    const bridge = createBridge({ dataDir, spawn });
    const results = await Promise.all([
      bridge.fetch({ source: 'a' }),
      bridge.fetch({ source: 'b' }),
    ]);
    assert.equal(maxRunning, 1);
    assert.equal(results.length, 2);
    await assert.rejects(bridge.fetch({ source: 'crash' }), (error) => {
      assert.ok(error instanceof BridgeError);
      assert.equal(error.kind, 'engine');
      assert.equal(error.message, 'MemoryError');
      return true;
    });
    await assert.rejects(bridge.request({ command: 'fetch', source: 'hang' }, 20), {
      kind: 'timeout',
    });
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
