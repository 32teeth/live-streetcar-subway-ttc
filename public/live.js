// Browser-only data source used on the static (GitHub Pages) build: rail ETAs come straight from
// the TTC's NTAS API (CORS-enabled); streetcar GPS comes through a CORS proxy of the GTFS-RT feed.
import { buildNetwork } from './src/network.mjs';
import { SubwayPoller } from './src/subway.mjs';
import { placeFeed } from './src/streetcar-place.mjs';
import { decodeFeed } from './src/gtfsrt-lite.mjs';

export async function startLive({ streetcarProxy }) {
  const derived = await (await fetch('data/gtfs-derived.json')).json();
  const { client, model } = buildNetwork(derived);
  const subway = new SubwayPoller(derived, model);
  subway.start();

  async function vehicles() {
    const status = { streetcars: streetcarProxy ? 'ok' : 'disabled', rapid: subway.lastRun ? { ...subway.lastRun } : null };
    let sc = [];
    if (streetcarProxy) {
      try {
        const res = await fetch(streetcarProxy, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        sc = placeFeed(model, decodeFeed(new Uint8Array(await res.arrayBuffer())));
      } catch (err) {
        status.streetcars = `error: ${err.message}`;
      }
    }
    return { updated: Date.now(), status, vehicles: [...sc, ...subway.trains()] };
  }

  return { network: client, vehicles };
}
