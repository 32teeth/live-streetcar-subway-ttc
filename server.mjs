import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNetwork } from './src/network.mjs';
import { SubwayPoller } from './src/subway.mjs';
import { StreetcarFeed } from './src/streetcar.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const derived = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'gtfs-derived.json'), 'utf8'));
const { client, model } = buildNetwork(derived);
for (const w of model.warnings) console.warn('layout warning:', w);

const streetcars = new StreetcarFeed(model);
const subway = new SubwayPoller(derived, model);
subway.start();

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(ROOT, 'public')));

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

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => console.log(`Live TTC map → http://localhost:${port}`));
process.on('SIGINT', () => { subway.stop(); server.close(); process.exit(0); });
