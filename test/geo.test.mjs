import test from 'node:test';
import assert from 'node:assert/strict';
import { geoPolyline, gridPolyline, snapToGeo, pointAt, vertexS, interpolate } from '../src/geo.mjs';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} !≈ ${b}`);

test('interpolate is piecewise linear and clamps outside the knots', () => {
  const knots = [[0, 0], [10, 100], [20, 100], [30, 0]];
  assert.equal(interpolate(knots, -5), 0);
  assert.equal(interpolate(knots, 5), 50);
  assert.equal(interpolate(knots, 15), 100);
  assert.equal(interpolate(knots, 25), 50);
  assert.equal(interpolate(knots, 99), 0);
});

test('pointAt walks a polyline by arclength, reports heading, and clamps', () => {
  const poly = gridPolyline([[0, 0], [10, 0], [10, 10]]);
  assert.equal(poly.length, 20);
  assert.deepEqual(pointAt(poly, 5), { x: 5, y: 0, angle: 0 });
  const down = pointAt(poly, 15);
  assert.equal(down.x, 10);
  assert.equal(down.y, 5);
  near(down.angle, Math.PI / 2);
  assert.deepEqual([pointAt(poly, -3).x, pointAt(poly, -3).y], [0, 0]);
  assert.deepEqual([pointAt(poly, 99).x, pointAt(poly, 99).y], [10, 10]);
});

test('vertexS returns the arclength of a vertex and rejects unknown points', () => {
  const poly = gridPolyline([[0, 0], [4, 0], [4, 3]]);
  assert.equal(vertexS(poly, 4, 0), 4);
  assert.equal(vertexS(poly, 4, 3), 7);
  assert.throws(() => vertexS(poly, 1, 1));
});

test('snapToGeo returns the perpendicular distance and position along an east-west route', () => {
  const route = geoPolyline([[43.7, -79.4], [43.7, -79.39]]);
  assert.ok(route.length > 780 && route.length < 830, `length ${route.length}`);
  const hit = snapToGeo(route, 43.7009, -79.395); // ~100 m north of the midpoint
  assert.ok(hit.dist > 95 && hit.dist < 105, `dist ${hit.dist}`);
  near(hit.s, route.length / 2, 2);
});

test('snapToGeo clamps to the ends of the route', () => {
  const route = geoPolyline([[43.7, -79.4], [43.7, -79.39]]);
  const before = snapToGeo(route, 43.7, -79.41);
  assert.equal(before.s, 0);
  assert.ok(before.dist > 700);
  assert.equal(snapToGeo(route, 43.7, -79.38).s, route.length);
});
