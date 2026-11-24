// Subway / LRT positions. The TTC publishes no GPS for rail, only per-platform arrival
// estimates (NTAS), so train positions are reconstructed from those arrival times.
import { pointAt } from './geo.mjs';

const NTAS = 'https://ntas.ttc.ca/api/ntas/get-next-train-time/';

export function parseEtas(body, line) {
  if (!Array.isArray(body)) return [];
  const entry = body.find((e) => String(e.line) === String(line)) || body[0];
  if (!entry || typeof entry.nextTrains !== 'string') return [];
  return entry.nextTrains.split(',').map((s) => s.trim()).filter((s) => s !== '').map(Number).filter((n) => Number.isFinite(n) && n >= 0);
}

/**
 * Walk back `eta` minutes from stop `j` along the pattern and return the fractional stop index
 * where the train should be right now.
 */
export function backtrack(segMin, j, eta) {
  let remaining = eta;
  let i = j;
  while (i > 0) {
    const m = segMin[i - 1];
    if (remaining <= m) return i - remaining / m;
    remaining -= m;
    i--;
  }
  return 0;
}

/**
 * Reconstruct trains for one direction pattern from per-stop ETAs (minutes).
 * The same train shows up in the ETA list of every stop downstream of it, so estimates are
 * taken from the nearest stop first (smallest ETA = most accurate) and later estimates that
 * land on an already-placed train are dropped.
 */
export function estimateTrains(pattern, etasByStop, mergeWindow = 1.0) {
  const cands = [];
  pattern.stopIds.forEach((id, j) => {
    for (const eta of etasByStop[id] || []) cands.push({ j, eta, pos: backtrack(pattern.segMin, j, eta) });
  });
  cands.sort((a, b) => a.eta - b.eta || a.j - b.j);
  const trains = [];
  for (const c of cands) if (!trains.some((t) => Math.abs(t.pos - c.pos) < mergeWindow)) trains.push(c);
  return trains;
}

/** Fractional stop index → grid position on the line's drawn path. */
export function placeOnLine(lineModel, pattern, pos) {
  const i0 = Math.min(pattern.names.length - 1, Math.floor(pos));
  const i1 = Math.min(pattern.names.length - 1, i0 + 1);
  const s0 = lineModel.stationS[pattern.names[i0]];
  const s1 = lineModel.stationS[pattern.names[i1]];
  const p = pointAt(lineModel.poly, s0 + (s1 - s0) * (pos - i0));
  // drawn paths follow direction-0 order, so direction-1 trains head the other way
  return { x: p.x, y: p.y, angle: pattern.dir === 1 ? p.angle + Math.PI : p.angle };
}

export class SubwayPoller {
  constructor(derived, model, { intervalMs = 20000, concurrency = 12, log = console } = {}) {
    this.derived = derived;
    this.model = model;
    this.intervalMs = intervalMs;
    this.concurrency = concurrency;
    this.log = log;
    this.etas = new Map(); // stopId → { etas, at }
    this.lastRun = null;
    this.stops = [];
    for (const [key, p] of Object.entries(derived.patterns)) for (const id of p.stopIds) this.stops.push({ id, key, line: p.line });
    this.running = false;
  }

  start() {
    const tick = () => this.poll().catch((e) => this.log.error('NTAS poll failed:', e.message));
    tick();
    this.timer = setInterval(tick, this.intervalMs);
    this.timer.unref?.();
  }

  stop() { clearInterval(this.timer); }

  async poll() {
    if (this.running) return;
    this.running = true;
    const started = Date.now();
    let ok = 0;
    const queue = [...this.stops];
    const worker = async () => {
      while (queue.length) {
        const s = queue.pop();
        try {
          const res = await fetch(NTAS + s.id, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) continue;
          this.etas.set(s.id, { etas: parseEtas(await res.json(), s.line), at: Date.now() });
          ok++;
        } catch { /* keep previous reading */ }
      }
    };
    await Promise.all(Array.from({ length: this.concurrency }, worker));
    this.lastRun = { at: Date.now(), ok, total: this.stops.length, ms: Date.now() - started };
    this.running = false;
  }

  trains(maxAgeMs = 120000) {
    const now = Date.now();
    const out = [];
    for (const [key, pattern] of Object.entries(this.derived.patterns)) {
      const byStop = {};
      for (const id of pattern.stopIds) {
        const r = this.etas.get(id);
        if (r && now - r.at <= maxAgeMs) byStop[id] = r.etas;
      }
      const lineModel = this.model.rapid[pattern.line];
      estimateTrains(pattern, byStop).forEach((t, n) => {
        const { x, y, angle } = placeOnLine(lineModel, pattern, t.pos);
        const next = Math.min(pattern.names.length - 1, Math.ceil(t.pos));
        out.push({
          id: `${key}#${n}`, kind: 'rapid', line: pattern.line, x, y, angle, estimated: true,
          toward: pattern.names.at(-1), next: pattern.names[next], etaMin: t.eta, nextEta: Math.round((next - t.pos) * (pattern.segMin[Math.max(0, next - 1)] || 1)),
        });
      });
    }
    return out;
  }
}
