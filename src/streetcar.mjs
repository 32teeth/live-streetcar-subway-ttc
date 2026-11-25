// Streetcar positions from the TTC GTFS-realtime vehicle feed (true GPS).
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { placeFeed } from './streetcar-place.mjs';

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
    const vehicles = placeFeed(this.model, feed);
    this.cache = { at: Date.now(), feedTime: Number(feed.header.timestamp), vehicles };
    return this.cache;
  }
}
