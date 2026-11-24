import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildNetwork } from '../src/network.mjs';

const derived = JSON.parse(fs.readFileSync(new URL('../data/gtfs-derived.json', import.meta.url), 'utf8'));
const { client, model } = buildNetwork(derived);

test('every drawn segment is horizontal, vertical or 45° (Beck rule)', () => {
  for (const line of [...client.rapid, ...client.streetcars]) {
    for (let i = 1; i < line.path.length; i++) {
      const dx = Math.abs(line.path[i][0] - line.path[i - 1][0]);
      const dy = Math.abs(line.path[i][1] - line.path[i - 1][1]);
      assert.ok(dx === 0 || dy === 0 || dx === dy, `${line.id} segment ${i - 1}→${i} is ${dx}×${dy}`);
    }
  }
});

test('every station of every rapid pattern is drawn, in schedule order along the line', () => {
  for (const line of client.rapid) {
    const names = derived.patterns[`${line.id}:0`].names;
    assert.deepEqual(line.stations.map((s) => s.name), names, `line ${line.id}`);
    const arc = model.rapid[line.id].stations.map((s) => s.s);
    for (let i = 1; i < arc.length; i++) assert.ok(arc[i] > arc[i - 1], `line ${line.id}: ${names[i]} is not past ${names[i - 1]}`);
  }
});

test('a station shared by several lines sits at the same point on each', () => {
  const seen = new Map();
  for (const line of Object.values(model.rapid)) {
    for (const s of line.stations) {
      const prev = seen.get(s.name);
      if (prev) assert.ok(Math.hypot(prev.x - s.x, prev.y - s.y) < 1e-9, `${s.name} differs between lines`);
      else seen.set(s.name, s);
    }
  }
  const interchanges = client.stations.filter((s) => s.interchange).map((s) => s.name).sort();
  assert.deepEqual(interchanges, ['Bloor-Yonge', 'Cedarvale', 'Eglinton', 'Finch West', 'Kennedy', 'Sheppard-Yonge', 'Spadina', 'St George']);
});

test('linked interchanges join two real interchange stations that sit next to each other', () => {
  assert.ok(client.links.length > 0);
  for (const k of client.links) {
    const a = client.stations.find((s) => s.name === k.a);
    const b = client.stations.find((s) => s.name === k.b);
    assert.ok(a?.interchange && b?.interchange, `${k.a}–${k.b} must both be interchanges`);
    assert.ok(Math.hypot(k.ax - k.bx, k.ay - k.by) <= 2, `${k.a}–${k.b} are too far apart to link`);
  }
});

test('opposite directions of each rapid line list the same stations in reverse', () => {
  for (const line of ['1', '2', '4', '5', '6']) {
    const a = derived.patterns[`${line}:0`];
    const b = derived.patterns[`${line}:1`];
    assert.deepEqual([...a.names].reverse(), b.names, `line ${line}`);
  }
});

test('schedule run times are positive and match the stop count', () => {
  for (const [key, p] of Object.entries(derived.patterns)) {
    assert.equal(p.segMin.length, p.stopIds.length - 1, key);
    assert.ok(p.segMin.every((m) => m >= 0.5 && m < 15), `${key} has an implausible run time`);
  }
});

test('every streetcar route resolves to a drawn line, and 504 includes its short-turn variant', () => {
  for (const route of ['501', '503', '504', '505', '506', '507', '508', '509', '510', '511', '512']) {
    assert.ok(model.routeToLines[route]?.length, `route ${route} not mapped`);
  }
  assert.deepEqual(model.routeToLines['504'].sort(), ['504', '504K']);
});
