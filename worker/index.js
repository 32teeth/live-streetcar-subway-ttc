// Cloudflare Worker: CORS proxy for the TTC GTFS-realtime vehicle feed (which sends no CORS headers).
// Deploy with `npx wrangler deploy` from this folder, then put the URL in the repo variable STREETCAR_PROXY.
const FEED = 'https://gtfsrt.ttc.ca/vehicles/position?format=binary';
const ALLOWED_ORIGINS = ['https://32teeth.github.io', 'http://localhost:3000'];

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin');
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });
    const upstream = await fetch(FEED, { cf: { cacheTtl: 8, cacheEverything: true } });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=8' },
    });
  },
};
