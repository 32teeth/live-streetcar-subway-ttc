import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { buildNetwork } from '../src/network.mjs';
import { SubwayPoller } from '../src/subway.mjs';
import { StreetcarFeed } from '../src/streetcar.mjs';
import { UNIT, LANE_PX } from '../src/layout.mjs';

const derived = JSON.parse(fs.readFileSync(new URL('../data/gtfs-derived.json', import.meta.url), 'utf8'));
const { model } = buildNetwork(derived);
const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;

async function withFetch(impl, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = impl;
  try { return await fn(); } finally { globalThis.fetch = real; }
}

const quiet = { error() {}, log() {}, warn() {} };

// ---------- subway / LRT ----------

test('SubwayPoller turns per-platform ETAs into estimated trains on the right line and direction', async () => {
  const pattern = derived.patterns['2:0'];
  const platform = pattern.stopIds[5];
  const requested = [];
  const fakeFetch = async (url) => {
    const id = String(url).split('/').pop();
    requested.push(id);
    const nextTrains = id === platform ? '2, 12' : '';
    return Response.json([{ line: '2', direction: '0', nextTrains, stopCode: id }]);
  };
  await withFetch(fakeFetch, async () => {
    const poller = new SubwayPoller(derived, model, { log: quiet });
    await poller.poll();
    assert.equal(poller.lastRun.ok, poller.lastRun.total);
    assert.ok(requested.includes(platform));

    const trains = poller.trains().filter((t) => t.line === '2' && t.id.startsWith('2:0#'));
    assert.equal(trains.length, 2);
    for (const t of trains) {
      assert.equal(t.kind, 'rapid');
      assert.equal(t.estimated, true);
      assert.equal(t.toward, 'Kennedy');
      assert.ok(Number.isFinite(t.x) && Number.isFinite(t.y));
      assert.ok(Math.abs(t.y - (26 + LANE_PX / UNIT)) < 1e-9, 'direction 0 rides the right-hand lane of Line 2');
      assert.ok(Math.cos(t.angle) > 0.99, 'direction 0 heads east');
    }
    // the 2-minute train is closer to the platform than the 12-minute one
    assert.ok(trains[0].x > trains[1].x);
  });
});

test('SubwayPoller ignores stale readings, failed requests and empty predictions', async () => {
  const pattern = derived.patterns['4:0'];
  const poller = new SubwayPoller(derived, model, { log: quiet });
  poller.etas.set(pattern.stopIds[3], { etas: [1], at: Date.now() - 10 * 60 * 1000 });
  assert.equal(poller.trains().filter((t) => t.line === '4').length, 0, 'stale ETA must not produce a train');

  await withFetch(async () => new Response('nope', { status: 503 }), () => poller.poll());
  assert.equal(poller.lastRun.ok, 0);
  assert.equal(poller.trains().length, 0);

  await withFetch(async (url) => Response.json([{ line: '6', nextTrains: '', stopCode: String(url).split('/').pop() }]), () => poller.poll());
  assert.equal(poller.trains().length, 0, 'empty nextTrains means no prediction, not a train at 0 min');
});

// ---------- streetcars ----------

const QUEEN_SPADINA = [43.6489, -79.3959];

function feedBytes(vehicles, headerTime = Math.floor(Date.now() / 1000)) {
  const msg = FeedMessage.create({
    header: { gtfsRealtimeVersion: '2.0', timestamp: headerTime },
    entity: vehicles.map((v, i) => ({
      id: String(i + 1),
      vehicle: {
        trip: { routeId: v.route },
        position: { latitude: v.lat, longitude: v.lon, bearing: v.bearing ?? 0, speed: v.speed ?? 0 },
        timestamp: v.ts ?? headerTime,
        vehicle: { id: v.id },
      },
    })),
  });
  return FeedMessage.encode(msg).finish();
}

const respond = (bytes) => async () => new Response(bytes, { headers: { 'content-type': 'application/x-protobuf' } });

test('StreetcarFeed keeps streetcars on tracked routes and places them with a heading', async () => {
  const now = Math.floor(Date.now() / 1000);
  const bytes = feedBytes([
    { id: '4001', route: '501', lat: QUEEN_SPADINA[0], lon: QUEEN_SPADINA[1], bearing: 90, speed: 8 },
    { id: '4002', route: '501', lat: QUEEN_SPADINA[0], lon: QUEEN_SPADINA[1], bearing: 270, speed: 8 },
    { id: '4003', route: '501', lat: QUEEN_SPADINA[0], lon: QUEEN_SPADINA[1], bearing: 90, speed: 0 },
    { id: '9001', route: '52', lat: 43.65, lon: -79.4, bearing: 0, speed: 5 },
    { id: '4004', route: '501', lat: 43.9, lon: -79.0, bearing: 0, speed: 5 },
    { id: '4005', route: '501', lat: QUEEN_SPADINA[0], lon: QUEEN_SPADINA[1], ts: now - 900 },
  ]);
  await withFetch(respond(bytes), async () => {
    const { vehicles } = await new StreetcarFeed(model).get();
    const byId = Object.fromEntries(vehicles.map((v) => [v.vehicle, v]));
    assert.deepEqual(Object.keys(byId).sort(), ['4001', '4002', '4003'], 'buses, off-route and 15-minute-old fixes are dropped');
    assert.equal(byId['4001'].line, '501');
    assert.ok(Math.cos(byId['4001'].angle) > 0.99, 'eastbound points east');
    assert.ok(Math.cos(byId['4002'].angle) < -0.99, 'westbound points west');
    assert.equal(byId['4003'].angle, null, 'a stopped streetcar has no heading chevron');
    assert.ok(Math.abs(byId['4003'].y - (30 + LANE_PX / UNIT)) < 1e-9, 'but its last bearing still puts it in the right lane');
    assert.ok(Math.abs(byId['4002'].y - (30 - LANE_PX / UNIT)) < 1e-9, 'westbound rides the north lane');
    assert.equal(byId['4001'].speedKmh, 29);
  });
});

test('StreetcarFeed caches responses and falls back to the last good data on failure', async () => {
  const bytes = feedBytes([{ id: '4001', route: '501', lat: QUEEN_SPADINA[0], lon: QUEEN_SPADINA[1], bearing: 90, speed: 8 }]);
  let calls = 0;
  const feed = new StreetcarFeed(model, { ttlMs: 60000 });
  await withFetch(async () => { calls++; return respond(bytes)(); }, async () => {
    await feed.get();
    await feed.get();
    assert.equal(calls, 1, 'second call within the TTL is served from cache');
  });

  const expired = new StreetcarFeed(model, { ttlMs: 0 });
  await withFetch(respond(bytes), () => expired.get());
  const fallback = await withFetch(async () => new Response('', { status: 500 }), () => expired.get());
  assert.equal(fallback.vehicles.length, 1);
  assert.match(fallback.error, /500/);

  const cold = new StreetcarFeed(model, { ttlMs: 0 });
  await withFetch(async () => new Response('', { status: 500 }), async () => {
    await assert.rejects(() => cold.get(), /500/);
  });
});

// ---------- browser build ----------

test('gtfsrt-lite decodes the same vehicle positions as gtfs-realtime-bindings', async () => {
  const { decodeFeed } = await import('../src/gtfsrt-lite.mjs');
  const { placeFeed } = await import('../src/streetcar-place.mjs');
  const now = Math.floor(Date.now() / 1000);
  const msg = FeedMessage.create({
    header: { gtfsRealtimeVersion: '2.0', timestamp: now },
    entity: [
      { id: '1', vehicle: { trip: { routeId: '501' }, position: { latitude: 43.6479, longitude: -79.4, bearing: 90, speed: 5 }, timestamp: now - 3, vehicle: { id: '4400' } } },
      { id: '2', vehicle: { trip: { routeId: '999' }, position: { latitude: 43.7, longitude: -79.4 }, timestamp: now } },
    ],
  });
  const bytes = FeedMessage.encode(msg).finish();
  const lite = decodeFeed(bytes);
  assert.equal(lite.header.timestamp, now);
  assert.equal(lite.entity.length, 2);
  assert.equal(lite.entity[0].vehicle.trip.routeId, '501');
  assert.equal(lite.entity[0].vehicle.vehicle.id, '4400');
  assert.ok(Math.abs(lite.entity[0].vehicle.position.latitude - 43.6479) < 1e-4);
  assert.equal(Object.hasOwn(lite.entity[1].vehicle.position, 'bearing'), false);
  assert.deepEqual(placeFeed(model, lite), placeFeed(model, FeedMessage.decode(bytes)));
});
