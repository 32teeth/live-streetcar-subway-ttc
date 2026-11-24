import express from 'express';

/** Express app serving the static front end plus the drawing and live-vehicle APIs. */
export function createApp({ client, streetcars, subway, publicDir }) {
  const app = express();
  app.disable('x-powered-by');
  // static files are tiny and change during development: never let a browser reuse a stale script
  app.use(express.static(publicDir, { etag: false, lastModified: false, setHeaders: (res) => res.set('Cache-Control', 'no-store') }));

  app.get('/api/network', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300').json(client);
  });

  app.get('/api/vehicles', async (_req, res) => {
    const status = { streetcars: 'ok', rapid: subway.lastRun ? { ...subway.lastRun } : null };
    let sc = [];
    try {
      const feed = await streetcars.get();
      sc = feed.vehicles;
      if (feed.error) status.streetcars = `stale: ${feed.error}`;
    } catch (err) {
      status.streetcars = `error: ${err.message}`;
    }
    res.set('Cache-Control', 'no-store').json({
      updated: Date.now(),
      status,
      vehicles: [...sc, ...subway.trains()],
    });
  });

  return app;
}
