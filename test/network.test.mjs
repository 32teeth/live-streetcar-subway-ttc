import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseEtas, backtrack, estimateTrains, placeOnLine } from '../src/subway.mjs';
import { buildNetwork, placeStreetcar } from '../src/network.mjs';

const derived = JSON.parse(fs.readFileSync(new URL('../data/gtfs-derived.json', import.meta.url), 'utf8'));
const { client, model } = buildNetwork(derived);

test('parseEtas ignores empty predictions instead of reading them as "0 minutes"', () => {
  assert.deepEqual(parseEtas([{ line: '6', nextTrains: '' }], '6'), []);
  assert.deepEqual(parseEtas([{ line: '2', nextTrains: '1, 5, 9' }], '2'), [1, 5, 9]);
  assert.deepEqual(parseEtas({ error: true }, '2'), []);
});

test('backtrack walks back along segment run-times', () => {
  const seg = [2, 2, 2];
  assert.equal(backtrack(seg, 3, 0), 3);
  assert.equal(backtrack(seg, 3, 1), 2.5);
  assert.equal(backtrack(seg, 3, 3), 1.5);
  assert.equal(backtrack(seg, 1, 10), 0);
});

test('estimateTrains merges the same train seen from several downstream stops', () => {
  const pattern = { stopIds: ['a', 'b', 'c', 'd', 'e', 'f'], segMin: [2, 2, 2, 2, 2] };
  // train 1 is 1 min short of "e"; train 2 is 4 min behind it. Both also appear on "f"'s list.
  const trains = estimateTrains(pattern, { e: [1, 5], f: [3, 7] });
  assert.deepEqual(trains.map((t) => t.pos), [3.5, 1.5]);
});

test('every pinned station lies on its line and trains stay on the drawn path', () => {
  const p = derived.patterns['2:0'];
  const mid = placeOnLine(model.rapid['2'], p, 3.5);
  assert.ok(Math.abs(mid.x - 6.5) < 1e-9 && mid.y === 26, JSON.stringify(mid));
});

test('layout has no anchor warnings and interchanges agree on coordinates', () => {
  assert.deepEqual(model.warnings, []);
  assert.ok(client.stations.find((s) => s.name === 'Bloor-Yonge').interchange);
});

test('heading follows the vehicle bearing along the drawn line', () => {
  const east = placeStreetcar(model, '501', 43.6489, -79.3959, 500, 90);
  const west = placeStreetcar(model, '501', 43.6489, -79.3959, 500, 270);
  assert.ok(Math.cos(east.angle) > 0.99, 'eastbound streetcar should point east on the Queen line');
  assert.ok(Math.cos(west.angle) < -0.99, 'westbound streetcar should point west');
  assert.equal(placeStreetcar(model, '501', 43.6489, -79.3959).angle, null);
});

test('trains in opposite directions point opposite ways on the same line', () => {
  const a = placeOnLine(model.rapid['2'], derived.patterns['2:0'], 3.5);
  const b = placeOnLine(model.rapid['2'], derived.patterns['2:1'], 3.5);
  assert.ok(Math.cos(a.angle) > 0.99 && Math.cos(b.angle) < -0.99);
});

test('streetcar fixes snap onto their own corridor and far-away fixes are dropped', () => {
  // Queen & Spadina area is on the Queen line (y=30) between x=16..18
  const q = placeStreetcar(model, '501', 43.6489, -79.3959);
  assert.equal(q.lineId, '501');
  assert.ok(Math.abs(q.y - 30) < 0.01 && q.x > 16 && q.x < 18, JSON.stringify(q));
  assert.equal(placeStreetcar(model, '501', 43.9, -79.0), null);
  assert.equal(placeStreetcar(model, '999', 43.65, -79.4), null);
});
