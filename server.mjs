import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './src/app.mjs';
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

const app = createApp({ client, streetcars, subway, publicDir: path.join(ROOT, 'public') });

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => console.log(`Live TTC map → http://localhost:${port}`));
process.on('SIGINT', () => { subway.stop(); server.close(); process.exit(0); });
