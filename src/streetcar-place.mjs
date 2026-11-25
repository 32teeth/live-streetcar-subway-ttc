// Turns a decoded GTFS-realtime vehicle feed into dots placed on the drawn streetcar routes.
// Shared by the Node server and the static (browser-only) build.
import { placeStreetcar } from './network.mjs';

export function placeFeed(model, feed) {
  const nowSec = Math.floor(Date.now() / 1000);
  const vehicles = [];
  for (const e of feed.entity) {
    const v = e.vehicle;
    const routeId = v?.trip?.routeId;
    if (!routeId || !v.position || !model.routeToLines[routeId]) continue;
    const ts = Number(v.timestamp || feed.header.timestamp);
    const age = nowSec - ts;
    if (age > 300) continue;
    const speedKmh = v.position.speed != null ? Math.round(v.position.speed * 3.6) : null;
    // the bearing picks the lane even when stopped; the heading chevron is only shown while moving
    const hasBearing = Object.hasOwn(v.position, 'bearing');
    const moving = speedKmh != null && speedKmh >= 2;
    const hit = placeStreetcar(model, routeId, v.position.latitude, v.position.longitude, 500, hasBearing ? v.position.bearing : null);
    if (!hit) continue;
    vehicles.push({
      id: `sc-${v.vehicle?.id ?? e.id}`, kind: 'streetcar', line: hit.lineId === '504K' ? '504' : hit.lineId,
      route: routeId, vehicle: v.vehicle?.id ?? null, x: hit.x, y: hit.y, angle: moving ? hit.angle : null, ageSec: Math.max(0, age),
      speedKmh,
    });
  }
  return vehicles;
}
