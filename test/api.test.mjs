import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.mjs';
import { buildNetwork } from '../src/network.mjs';

const derived = JSON.parse(fs.readFileSync(new URL('../data/gtfs-derived.json', import.meta.url), 'utf8'));
const { client } = buildNetwork(derived);
const publicDir = fileURLToPath(new URL('../public', import.meta.url));

const streetcar = { id: 'sc-1', kind: 'streetcar', line: '501', x: 1, y: 2 };
const train = { id: '1:0#0', kind: 'rapid', line: '1', x: 3, y: 4 };

async function serve(opts, fn) {
  const server = createApp({ client, publicDir, ...opts }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { return await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

test('GET /api/network returns the drawing data, cacheable', async () => {
  await serve({ streetcars: { get: async () => ({ vehicles: [] }) }, subway: { lastRun: null, trains: () => [] } }, async (base) => {
    const res = await fetch(`${base}/api/network`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control'), /max-age/);
    const body = await res.json();
    assert.equal(body.rapid.length, 5);
    assert.ok(body.streetcars.length >= 10);
    assert.ok(body.stations.length > 100);
  });
});

test('GET /api/vehicles merges streetcars and trains and is never cached', async () => {
  const subway = { lastRun: { ok: 234, total: 234 }, trains: () => [train] };
  await serve({ streetcars: { get: async () => ({ vehicles: [streetcar] }) }, subway }, async (base) => {
    const res = await fetch(`${base}/api/vehicles`);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.json();
    assert.deepEqual(body.vehicles, [streetcar, train]);
    assert.equal(body.status.streetcars, 'ok');
    assert.deepEqual(body.status.rapid, { ok: 234, total: 234 });
  });
});

test('GET /api/vehicles still answers when the streetcar feed is stale or down', async () => {
  const subway = { lastRun: null, trains: () => [train] };
  await serve({ streetcars: { get: async () => ({ vehicles: [streetcar], error: 'HTTP 500' }) }, subway }, async (base) => {
    const body = await (await fetch(`${base}/api/vehicles`)).json();
    assert.equal(body.status.streetcars, 'stale: HTTP 500');
    assert.equal(body.status.rapid, null);
    assert.equal(body.vehicles.length, 2);
  });
  await serve({ streetcars: { get: async () => { throw new Error('boom'); } }, subway }, async (base) => {
    const res = await fetch(`${base}/api/vehicles`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status.streetcars, 'error: boom');
    assert.deepEqual(body.vehicles, [train]);
  });
});

test('the front end is served from the public directory', async () => {
  await serve({ streetcars: { get: async () => ({ vehicles: [] }) }, subway: { lastRun: null, trains: () => [] } }, async (base) => {
    const html = await (await fetch(`${base}/`)).text();
    assert.match(html, /<svg id="map"/);
    assert.equal((await fetch(`${base}/app.js`)).status, 200);
    assert.equal((await fetch(`${base}/app.js`)).headers.get('cache-control'), 'no-store', 'a stale cached script must never be reused');
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  });
});
