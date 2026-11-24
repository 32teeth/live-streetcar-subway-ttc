// Streetcar positions from the TTC GTFS-realtime vehicle feed (true GPS).
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { placeStreetcar } from './network.mjs';

const FEED = 'https://gtfsrt.ttc.ca/vehicles/position?format=binary';
const { FeedMessage } = GtfsRealtimeBindings.transit_realtime;

export class StreetcarFeed {
  constructor(model, { ttlMs = 8000 } = {}) {
    this.model = model;
    this.ttlMs = ttlMs;
    this.cache = null;
    this.inflight = null;
  }

  async get() {
    if (this.cache && Date.now() - this.cache.at < this.ttlMs) return this.cache;
    this.inflight ||= this.refresh().finally(() => { this.inflight = null; });
    try {
      return await this.inflight;
    } catch (err) {
      if (this.cache) return { ...this.cache, error: err.message };
      throw err;
    }
  }

  async refresh() {
    const res = await fetch(FEED, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`GTFS-RT HTTP ${res.status}`);
    const feed = FeedMessage.decode(new Uint8Array(await res.arrayBuffer()));
    const nowSec = Math.floor(Date.now() / 1000);
    const vehicles = [];
    for (const e of feed.entity) {
      const v = e.vehicle;
      const routeId = v?.trip?.routeId;
      if (!routeId || !v.position || !this.model.routeToLines[routeId]) continue;
      const ts = Number(v.timestamp || feed.header.timestamp);
      const age = nowSec - ts;
      if (age > 300) continue;
      const speedKmh = v.position.speed != null ? Math.round(v.position.speed * 3.6) : null;
      // the bearing picks the lane even when stopped; the heading chevron is only shown while moving
      const hasBearing = Object.hasOwn(v.position, 'bearing');
      const moving = speedKmh != null && speedKmh >= 2;
      const hit = placeStreetcar(this.model, routeId, v.position.latitude, v.position.longitude, 500, hasBearing ? v.position.bearing : null);
      if (!hit) continue;
      vehicles.push({
        id: `sc-${v.vehicle?.id ?? e.id}`, kind: 'streetcar', line: hit.lineId === '504K' ? '504' : hit.lineId,
        route: routeId, vehicle: v.vehicle?.id ?? null, x: hit.x, y: hit.y, angle: moving ? hit.angle : null, ageSec: Math.max(0, age),
        speedKmh,
      });
    }
    this.cache = { at: Date.now(), feedTime: Number(feed.header.timestamp), vehicles };
    return this.cache;
  }
}
