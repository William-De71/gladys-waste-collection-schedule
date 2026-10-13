// -----------------------------------------------------------------------------
// The Waste Collection Schedule engine: python/bridge.py, one short-lived
// Python process per request.
//
// One process at a time (a queue): a source may parse a PDF or an HTML page
// of several megabytes, and the container has 256 MB for Node and Python
// together. A process that runs past the timeout is killed. The process gets
// a minimal environment: no Gladys token ever reaches the sources.
// -----------------------------------------------------------------------------

import { spawn as nodeSpawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

export const FETCH_TIMEOUT_MS = 100 * 1000;
export const SEARCH_TIMEOUT_MS = 20 * 1000;
const MAX_OUTPUT = 16 * 1024 * 1024;
const MAX_STDERR = 4096;

export class BridgeError extends Error {
  /**
   * @param {string} kind - 'timeout' or 'engine'.
   * @param {string} message - What happened.
   */
  constructor(kind, message) {
    super(message);
    this.kind = kind;
  }
}

/**
 * @description Create the engine client.
 * @param {object} [options] - Paths and test doubles.
 * @param {string} [options.python] - Python interpreter.
 * @param {string} [options.script] - bridge.py.
 * @param {string} [options.libDir] - Folder of the waste_collection_schedule package.
 * @param {string} [options.dataDir] - Writable folder (TMPDIR and HOME of Python).
 * @param {Function} [options.spawn] - child_process.spawn.
 * @param {object} [options.logger] - SDK logger.
 * @returns {{ request: Function, fetch: Function, search: Function, version: Function }} The client.
 */
export function createBridge({
  python = process.env.WCS_PYTHON || 'python3',
  script = process.env.WCS_BRIDGE || new URL('../python/bridge.py', import.meta.url).pathname,
  libDir = process.env.WCS_LIB_DIR || '/app/python/lib',
  dataDir = process.env.WCS_DATA_DIR || '/data',
  spawn = nodeSpawn,
  logger = null,
} = {}) {
  let queue = Promise.resolve();
  const tmpDir = `${dataDir}/tmp`;

  const env = () => {
    try {
      mkdirSync(tmpDir, { recursive: true });
    } catch {
      // read-only test environment: Python falls back on its own
    }
    return {
      PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
      TZ: process.env.TZ ?? '',
      LANG: 'C.UTF-8',
      HOME: dataDir,
      TMPDIR: tmpDir,
      WCS_LIB_DIR: libDir,
      // Tests point the INSEE lookup at a local server.
      ...(process.env.WCS_GEO_API ? { WCS_GEO_API: process.env.WCS_GEO_API } : {}),
      PYTHONDONTWRITEBYTECODE: '1',
      PYTHONUNBUFFERED: '1',
      ...(process.env.WCS_DEBUG ? { WCS_DEBUG: '1' } : {}),
    };
  };

  const run = (payload, timeoutMs) =>
    new Promise((resolve, reject) => {
      const child = spawn(python, ['-I', script], { env: env(), stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const finish = (error, value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        if (error) {
          reject(error);
        } else {
          resolve(value);
        }
      };
      const timer = setTimeout(() => {
        // Settle first: the `close` of the killed process must not win.
        finish(new BridgeError('timeout', `no answer after ${Math.round(timeoutMs / 1000)} s`));
        child.kill('SIGKILL');
      }, timeoutMs);
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (stdout.length > MAX_OUTPUT) {
          finish(new BridgeError('engine', 'answer too large'));
          child.kill('SIGKILL');
        }
      });
      child.stderr.on('data', (chunk) => {
        stderr = (stderr + chunk).slice(-MAX_STDERR);
      });
      child.on('error', (error) => finish(new BridgeError('engine', error.message)));
      child.on('close', (code, signal) => {
        if (stderr.trim() && logger) {
          logger.debug(`engine: ${stderr.trim()}`);
        }
        const line = stdout.trim().split('\n').pop();
        try {
          finish(null, JSON.parse(line));
        } catch {
          const reason = signal ? `killed (${signal})` : `exit code ${code}`;
          const detail = stderr.trim().split('\n').pop() || reason;
          finish(new BridgeError('engine', detail.slice(0, 300)));
        }
      });
      child.stdin.on('error', () => {});
      child.stdin.end(JSON.stringify(payload));
    });

  /**
   * @description Send one request, after the previous ones.
   * @param {object} payload - The request.
   * @param {number} timeoutMs - Kill the process after this delay.
   * @returns {Promise<object>} The answer of bridge.py.
   */
  const request = (payload, timeoutMs = FETCH_TIMEOUT_MS) => {
    const result = queue.then(() => run(payload, timeoutMs));
    queue = result.catch(() => {});
    return result;
  };

  return {
    request,
    /** @param {{ source, country, address, args }} query - What a slot asks for. */
    fetch: (query) => request({ command: 'fetch', ...query }, FETCH_TIMEOUT_MS),
    search: (query, limit = 6) => request({ command: 'search', query, limit }, SEARCH_TIMEOUT_MS),
    version: () => request({ command: 'version' }, SEARCH_TIMEOUT_MS),
  };
}
