// python/bridge.py for real, against a stand-in of the waste_collection_schedule
// package (test/fixtures/python-lib): the protocol, the error kinds, the
// search. Skipped where no python3 is installed. No network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
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
      const answer = await bridge.fetch('fake_town', { city: 'Springfield' });
      assert.deepEqual(answer, {
        ok: true,
        title: 'Fake Town',
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
  try {
    assert.equal((await bridge.fetch('nope', {})).kind, 'not_found');
    assert.equal((await bridge.fetch('../etc/passwd', {})).kind, 'not_found');
    assert.equal((await bridge.fetch('broken', {})).kind, 'not_found');
    const missing = await bridge.fetch('fake_town', {});
    assert.equal(missing.kind, 'bad_args');
    assert.match(missing.error, /city/);
    assert.equal((await bridge.fetch('fake_town', { town: 'x' })).kind, 'bad_args');
    const unknown = await bridge.fetch('fake_town', { city: 'Capital City' });
    assert.deepEqual(unknown, {
      ok: false,
      kind: 'bad_args',
      error: "city 'Capital City' not found",
      argument: 'city',
      suggestions: ['Springfield', 'Shelbyville'],
    });
    const down = await bridge.fetch('fake_town', { city: 'Springfield', fail: true });
    assert.deepEqual(down, { ok: false, kind: 'fetch', error: 'ConnectionError: server down' });
    assert.equal((await bridge.request({ command: 'nope' })).kind, 'request');
  } finally {
    cleanup();
  }
});

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
        { name: 'city', required: true },
        { name: 'street', required: false },
        { name: 'fail', required: false },
      ],
      docs_url: 'https://example.org/fake_town.md',
    });
    assert.equal((await bridge.search('NÉVERLAND shelby')).total, 1);
    assert.equal((await bridge.search('x')).kind, 'request');
    assert.deepEqual(await bridge.version(), { ok: true, version: '9.9.9', sources: 3 });
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
    const results = await Promise.all([bridge.fetch('a', {}), bridge.fetch('b', {})]);
    assert.equal(maxRunning, 1);
    assert.equal(results.length, 2);
    await assert.rejects(bridge.fetch('crash', {}), (error) => {
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
