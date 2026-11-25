// Assembles the static site for GitHub Pages into dist/.
//   STREETCAR_PROXY  URL of the deployed CORS proxy (see worker/); without it streetcars are omitted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(ROOT, 'dist');
fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), dist, { recursive: true });
fs.cpSync(path.join(ROOT, 'src'), path.join(dist, 'src'), { recursive: true });
fs.mkdirSync(path.join(dist, 'data'));
fs.copyFileSync(path.join(ROOT, 'data', 'gtfs-derived.json'), path.join(dist, 'data', 'gtfs-derived.json'));
fs.rmSync(path.join(dist, 'src', 'app.mjs')); // Express app is server-only
fs.rmSync(path.join(dist, 'src', 'streetcar.mjs')); // Node feed client is server-only
fs.writeFileSync(path.join(dist, '.nojekyll'), '');

const config = { static: true, streetcarProxy: process.env.STREETCAR_PROXY || null };
fs.writeFileSync(path.join(dist, 'config.js'), `window.TTC = ${JSON.stringify(config)};\n`);
console.log(`Built ${dist}`, config);
