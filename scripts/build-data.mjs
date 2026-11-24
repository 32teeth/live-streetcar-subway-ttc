// Derives data/gtfs-derived.json from the TTC static GTFS feed (City of Toronto Open Data).
// Usage: npm run build:data   (downloads ~60 MB once into .cache/gtfs)
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache', 'gtfs');
const OUT = path.join(ROOT, 'data', 'gtfs-derived.json');
const CKAN = 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/package_show?id=merged-gtfs-ttc-routes-and-schedules';

const RAPID_ROUTES = ['1', '2', '4', '5', '6'];
// Reference shapes used to snap streetcar GPS fixes onto the diagram.
const SHAPES = {
  '501': 'shp-501-51',
  '503': 'shp-503-02',
  '504': 'shp-504-N6',
  '504K': 'shp-504-61',
  '505': 'shp-505-09',
  '506': 'shp-506-03',
  '509': 'shp-509-03',
  '510': 'shp-510-06',
  '511': 'shp-511-04',
  '512': 'shp-512-09',
};

async function ensureGtfs() {
  if (fs.existsSync(path.join(CACHE, 'stop_times.txt'))) return;
  fs.mkdirSync(CACHE, { recursive: true });
  console.log('Resolving GTFS download URL…');
  const meta = await (await fetch(CKAN)).json();
  const res = meta.result.resources.find((r) => /gtfs/i.test(r.name));
  console.log('Downloading', res.url);
  const buf = Buffer.from(await (await fetch(res.url)).arrayBuffer());
  const zip = path.join(CACHE, 'gtfs.zip');
  fs.writeFileSync(zip, buf);
  execFileSync('unzip', ['-oq', zip, '-d', CACHE]);
}

function parseLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function eachRow(file, fn) {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(CACHE, file)), crlfDelay: Infinity });
  let head = null;
  for await (const line of rl) {
    if (!line) continue;
    const cells = parseLine(line.replace(/^\uFEFF/, ''));
    if (!head) { head = cells; continue; }
    const row = {};
    for (let i = 0; i < head.length; i++) row[head[i]] = cells[i];
    fn(row);
  }
}

const normName = (n) => n.replace(/ - .*Platform$/i, '').replace(/ Station$/i, '').trim();
const secs = (t) => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + s; };
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

function dist(a, b) {
  const dy = (a[0] - b[0]) * 111000;
  const dx = (a[1] - b[1]) * 111000 * Math.cos((a[0] * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

await ensureGtfs();

const stops = new Map();
await eachRow('stops.txt', (r) => stops.set(r.stop_id, r));
const stationOf = (id) => {
  const s = stops.get(id);
  const p = s.parent_station ? stops.get(s.parent_station) : null;
  return normName((p || s).stop_name);
};

const trips = new Map();
await eachRow('trips.txt', (r) => {
  if (RAPID_ROUTES.includes(r.route_id)) trips.set(r.trip_id, { route: r.route_id, dir: r.direction_id });
});

const seqs = new Map();
await eachRow('stop_times.txt', (r) => {
  if (!trips.has(r.trip_id)) return;
  let a = seqs.get(r.trip_id);
  if (!a) seqs.set(r.trip_id, (a = []));
  a.push([Number(r.stop_sequence), r.stop_id, secs(r.arrival_time)]);
});

const patternCounts = new Map();
for (const [id, rows] of seqs) {
  rows.sort((a, b) => a[0] - b[0]);
  const t = trips.get(id);
  const key = `${t.route}:${t.dir}`;
  const sig = rows.map((r) => r[1]).join(',');
  let m = patternCounts.get(key);
  if (!m) patternCounts.set(key, (m = new Map()));
  let e = m.get(sig);
  if (!e) m.set(sig, (e = { n: 0, trips: [] }));
  e.n++;
  e.trips.push(rows);
}

const patterns = {};
const stations = {};
for (const [key, m] of patternCounts) {
  const [sig, best] = [...m.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  const stopIds = sig.split(',');
  const gaps = stopIds.slice(1).map(() => []);
  for (const rows of best.trips) for (let i = 1; i < rows.length; i++) gaps[i - 1].push((rows[i][2] - rows[i - 1][2]) / 60);
  const [line, dir] = key.split(':');
  patterns[key] = {
    line,
    dir: Number(dir),
    stopIds,
    names: stopIds.map(stationOf),
    segMin: gaps.map((g) => Math.max(0.5, Math.round(median(g) * 100) / 100)),
  };
  for (const id of stopIds) {
    const s = stops.get(id);
    const p = s.parent_station ? stops.get(s.parent_station) : s;
    stations[stationOf(id)] = { lat: Number(p.stop_lat), lon: Number(p.stop_lon) };
  }
}

const want = new Set(Object.values(SHAPES));
const rawShapes = new Map();
await eachRow('shapes.txt', (r) => {
  if (!want.has(r.shape_id)) return;
  let a = rawShapes.get(r.shape_id);
  if (!a) rawShapes.set(r.shape_id, (a = []));
  a.push([Number(r.shape_pt_sequence), Number(r.shape_pt_lat), Number(r.shape_pt_lon)]);
});

const shapes = {};
for (const [key, id] of Object.entries(SHAPES)) {
  const pts = (rawShapes.get(id) || []).sort((a, b) => a[0] - b[0]).map((p) => [p[1], p[2]]);
  if (!pts.length) throw new Error(`shape ${id} not found`);
  const thin = [pts[0]];
  for (const p of pts) if (dist(thin[thin.length - 1], p) >= 20) thin.push(p);
  if (thin[thin.length - 1] !== pts[pts.length - 1]) thin.push(pts[pts.length - 1]);
  shapes[key] = thin.map(([a, b]) => [Math.round(a * 1e5) / 1e5, Math.round(b * 1e5) / 1e5]);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), stations, patterns, shapes }));
console.log(`Wrote ${path.relative(ROOT, OUT)}: ${Object.keys(patterns).length} patterns, ${Object.keys(stations).length} stations, ${Object.keys(shapes).length} shapes`);
