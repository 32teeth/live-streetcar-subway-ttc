const NS = 'http://www.w3.org/2000/svg';
const REFRESH_MS = 10000;

const svg = document.getElementById('map');
const tip = document.getElementById('tip');

const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent?.appendChild(n);
  return n;
};

let net;
let U;
const px = (v) => v * U;
const layers = {};

// ---------- static diagram ----------

const SIDES = {
  e: { dx: 13, dy: 4, a: 'start', r: 0 },
  w: { dx: -13, dy: 4, a: 'end', r: 0 },
  eu: { dx: 13, dy: -4, a: 'start', r: 0 },
  wu: { dx: -13, dy: -4, a: 'end', r: 0 },
  n: { dx: 0, dy: -14, a: 'middle', r: 0 },
  s: { dx: 0, dy: 22, a: 'middle', r: 0 },
  ne: { dx: 5, dy: -8, a: 'start', r: -45 },
  nw: { dx: -5, dy: -8, a: 'end', r: 45 },
  se: { dx: 5, dy: 14, a: 'start', r: 45 },
  sw: { dx: -5, dy: 14, a: 'end', r: -45 },
};

function label(parent, text, x, y, side, cls = '', size = 11.5, weight = 400) {
  const s = SIDES[side] || SIDES.e;
  const t = el('text', {
    transform: `translate(${px(x) + s.dx} ${px(y) + s.dy}) rotate(${s.r})`,
    'text-anchor': s.a, 'font-size': size, 'font-weight': weight, class: cls,
  }, parent);
  t.textContent = text;
}

const pathD = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${px(p[0])} ${px(p[1])}`).join(' ');

function drawStatic() {
  svg.replaceChildren();
  const W = px(net.canvas.w);
  const H = px(net.canvas.h);
  el('rect', { x: -4000, y: -4000, width: 8000 + W, height: 8000 + H, fill: getComputedStyle(document.documentElement).getPropertyValue('--paper') }, svg);
  const defs = el('defs', {}, svg);
  const f = el('filter', { id: 'shadow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
  el('feDropShadow', { dx: 0, dy: 1, stdDeviation: 1.4, 'flood-color': '#000', 'flood-opacity': 0.55 }, f);

  const lake = el('g', {}, svg);
  el('polygon', { points: net.lake.map((p) => `${px(p[0])},${px(p[1])}`).join(' '), fill: '#d5e6ec' }, lake);
  const lt = el('text', { x: px(30), y: px(36.9), class: 'lake-label', 'font-size': 20, 'text-anchor': 'middle' }, lake);
  lt.textContent = 'LAKE ONTARIO';

  const sc = el('g', { 'stroke-linejoin': 'round', 'stroke-linecap': 'round', fill: 'none' }, svg);
  for (const l of net.streetcars) el('path', { d: pathD(l.path), stroke: l.color, 'stroke-width': 4.5 }, sc);

  const rapid = el('g', { 'stroke-linejoin': 'round', 'stroke-linecap': 'round', fill: 'none' }, svg);
  for (const l of net.rapid) {
    el('path', { d: pathD(l.path), stroke: l.ink, 'stroke-width': 10, opacity: 0.35 }, rapid);
    el('path', { d: pathD(l.path), stroke: l.color, 'stroke-width': 8 }, rapid);
  }

  // ticks (Beck-style) on every rapid station
  // Beck-style ticks: a short stub on the label side of the line, starting at the line's edge (never crossing it)
  const sideVec = { e: [1, 0], w: [-1, 0], eu: [1, 0], wu: [-1, 0], n: [0, -1], s: [0, 1], ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1] };
  const sideOf = new Map(net.stations.map((s) => [s.name, s]));
  for (const l of net.rapid) {
    const ticks = el('g', { stroke: l.color, 'stroke-width': 2.6, 'stroke-linecap': 'butt' }, svg);
    for (const s of l.stations) {
      const st = sideOf.get(s.name);
      if (st?.interchange) continue;
      let nx = -Math.sin(s.angle);
      let ny = Math.cos(s.angle);
      const [lx, ly] = sideVec[st?.side] || [0, 1];
      const dot = nx * lx + ny * ly;
      if (dot < 0 || (dot === 0 && ny < 0)) { nx = -nx; ny = -ny; }
      el('line', { x1: px(s.x) + nx * 3, y1: px(s.y) + ny * 3, x2: px(s.x) + nx * 9.5, y2: px(s.y) + ny * 9.5 }, ticks);
    }
  }

  const stops = el('g', {}, svg);
  for (const s of net.stations) {
    if (s.interchange) el('circle', { cx: px(s.x), cy: px(s.y), r: 8.5, fill: '#fff', stroke: '#1b1b1b', 'stroke-width': 3 }, stops);
  }
  for (const l of net.streetcars) {
    for (const t of l.terminals) el('circle', { cx: px(t.x), cy: px(t.y), r: 5, fill: '#fff', stroke: l.color, 'stroke-width': 3 }, stops);
  }
  for (const x of net.extraStops) el('circle', { cx: px(x.x), cy: px(x.y), r: 4.5, fill: '#fff', stroke: net.streetcarColor, 'stroke-width': 2.5 }, stops);

  const labels = el('g', {}, svg);
  const done = new Set();
  const isEnd = (name) => net.rapid.some((l) => l.stations[0].name === name || l.stations.at(-1).name === name);
  for (const s of net.stations) {
    const bold = s.interchange || isEnd(s.name);
    label(labels, s.name, s.x, s.y, s.side, '', bold ? 13.5 : 11.5, bold ? 700 : 400);
  }
  for (const l of net.streetcars) {
    for (const t of l.terminals) {
      const key = `${t.name}@${t.x},${t.y}`;
      if (done.has(key)) continue;
      done.add(key);
      label(labels, t.name, t.x, t.y, t.side, '', 11, 600);
    }
  }
  for (const x of net.extraStops) label(labels, x.name, x.x, x.y, x.label, '', 11, 600);

  const badges = el('g', {}, svg);
  for (const l of net.streetcars) {
    for (const b of l.badges) {
      const w = 30;
      el('rect', { x: px(b.x) - w / 2, y: px(b.y) - 9, width: w, height: 18, rx: 4, fill: '#fff', stroke: l.color, 'stroke-width': 2.5 }, badges);
      const t = el('text', { x: px(b.x), y: px(b.y) + 4.5, 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 700, style: 'stroke:none' }, badges);
      t.textContent = b.text;
    }
  }

  layers.vehicles = el('g', {}, svg);
}

// ---------- live vehicles ----------

const dots = new Map(); // key → { g, x, y, line, data }
const lineInfo = () => Object.fromEntries([...net.rapid, ...net.streetcars].map((l) => [l.id, l]));
let info;

function makeDot(v) {
  const color = info[v.line].color;
  const g = el('g', { class: `vehicle fade${v.estimated ? ' est' : ''}` }, layers.vehicles);
  el('circle', { class: 'halo', r: 10.5, stroke: v.estimated ? color : 'none' }, g);
  el('circle', { r: 6.5, fill: color, stroke: '#fff', 'stroke-width': 2.6, filter: 'url(#shadow)' }, g);
  const chevron = el('path', { d: 'M-2.6 -3.4 L3.2 0 L-2.6 3.4 L-1.2 0 Z', fill: '#fff' }, g);
  g.chevron = chevron;
  g.addEventListener('pointerenter', (e) => showTip(e, g));
  g.addEventListener('pointermove', (e) => moveTip(e));
  g.addEventListener('pointerleave', () => { tip.hidden = true; });
  return g;
}

function describe(v) {
  const l = info[v.line];
  if (v.kind === 'streetcar') {
    return `<b>${v.route} ${l.name}</b><small>Vehicle ${v.vehicle ?? '—'} · reported ${v.ageSec}s ago</small><small>Live GPS</small>`;
  }
  const eta = v.nextEta > 0 ? ` in ~${v.nextEta} min` : ' now';
  return `<b>Line ${l.id} ${l.name}</b><small>toward ${v.toward}</small><small>Next stop ${v.next}${eta}</small><small>Estimated position</small>`;
}

function showTip(e, g) {
  const d = [...dots.values()].find((x) => x.g === g);
  if (!d) return;
  tip.innerHTML = describe(d.data);
  tip.hidden = false;
  moveTip(e);
}
function moveTip(e) {
  const r = tip.getBoundingClientRect();
  tip.style.left = `${Math.min(e.clientX + 14, innerWidth - r.width - 8)}px`;
  tip.style.top = `${Math.min(e.clientY + 14, innerHeight - r.height - 8)}px`;
}

// Existing dots keep their DOM node and only change position when it actually changed;
// only genuinely new vehicles are created (and fade in).
function applyVehicle(d, v) {
  d.data = v;
  d.line = v.line;
  if (d.x !== v.x || d.y !== v.y) {
    d.x = v.x;
    d.y = v.y;
    d.g.setAttribute('transform', `translate(${px(v.x)} ${px(v.y)})`);
  }
  d.g.classList.toggle('stale', (v.ageSec ?? 0) > 120);
  if (v.angle == null) d.g.chevron.setAttribute('display', 'none');
  else {
    d.g.chevron.removeAttribute('display');
    d.g.chevron.setAttribute('transform', `rotate(${((v.angle * 180) / Math.PI).toFixed(1)})`);
  }
}

function reconcile(vehicles) {
  const prev = new Map(dots);
  const next = new Map();
  const rapid = [];
  const created = [];

  for (const v of vehicles) {
    if (v.kind === 'rapid') { rapid.push(v); continue; }
    const d = prev.get(v.id);
    if (d) { prev.delete(v.id); next.set(v.id, d); applyVehicle(d, v); } else created.push(v);
  }

  // rapid ids are rank-based, so pair each train with the nearest previous dot on the same pattern
  const pairs = [];
  for (const v of rapid) {
    const pattern = v.id.split('#')[0];
    for (const [k, d] of prev) {
      if (!k.startsWith(`${pattern}#`)) continue;
      const dist = Math.hypot(d.x - v.x, d.y - v.y);
      if (dist < 3) pairs.push({ v, k, d, dist });
    }
  }
  pairs.sort((a, b) => a.dist - b.dist);
  const matched = new Set();
  for (const p of pairs) {
    if (matched.has(p.v) || !prev.has(p.k)) continue;
    matched.add(p.v);
    prev.delete(p.k);
    next.set(p.v.id, p.d);
    applyVehicle(p.d, p.v);
  }
  for (const v of rapid) if (!matched.has(v)) created.push(v);

  for (const v of created) {
    const d = { g: makeDot(v), x: null, y: null };
    applyVehicle(d, v);
    next.set(v.id, d);
  }
  for (const d of prev.values()) d.g.remove();
  dots.clear();
  for (const [k, d] of next) dots.set(k, d);
}

async function refresh() {
  try {
    const res = await fetch('/api/vehicles', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    reconcile(data.vehicles);
  } catch (err) {
    console.warn(`Vehicle refresh failed: ${err.message}`);
  }
}

// ---------- pan / zoom ----------

const vb = { x: 0, y: 0, w: 1, h: 1 };
const applyVB = () => svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

function fit() {
  const cw = px(net.canvas.w);
  const ch = px(net.canvas.h);
  const s = Math.min(innerWidth / cw, innerHeight / ch);
  vb.w = innerWidth / s;
  vb.h = innerHeight / s;
  vb.x = px(net.canvas.x) + (cw - vb.w) / 2;
  vb.y = px(net.canvas.y) + (ch - vb.h) / 2;
  applyVB();
}

function zoomAt(cx, cy, factor) {
  const r = svg.getBoundingClientRect();
  const mx = vb.x + ((cx - r.left) / r.width) * vb.w;
  const my = vb.y + ((cy - r.top) / r.height) * vb.h;
  const base = Math.min(innerWidth / px(net.canvas.w), innerHeight / px(net.canvas.h));
  const w = Math.max(innerWidth / (base * 6), Math.min(innerWidth / (base * 0.8), vb.w * factor));
  const k = w / vb.w;
  vb.x = mx - (mx - vb.x) * k;
  vb.y = my - (my - vb.y) * k;
  vb.h *= k;
  vb.w = w;
  applyVB();
}

function setupGestures() {
  svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.0015)); }, { passive: false });
  const ptrs = new Map();
  let pinch = 0;
  svg.addEventListener('pointerdown', (e) => { e.preventDefault(); ptrs.set(e.pointerId, e); svg.setPointerCapture(e.pointerId); svg.classList.add('drag'); });
  svg.addEventListener('pointermove', (e) => {
    const prev = ptrs.get(e.pointerId);
    if (!prev) return;
    ptrs.set(e.pointerId, e);
    const r = svg.getBoundingClientRect();
    if (ptrs.size === 1) {
      vb.x -= ((e.clientX - prev.clientX) / r.width) * vb.w;
      vb.y -= ((e.clientY - prev.clientY) / r.height) * vb.h;
      applyVB();
    } else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (pinch) zoomAt((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, pinch / d);
      pinch = d;
    }
  });
  const up = (e) => { ptrs.delete(e.pointerId); pinch = 0; if (!ptrs.size) svg.classList.remove('drag'); };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', up);
  svg.addEventListener('dblclick', fit);
  svg.addEventListener('selectstart', (e) => e.preventDefault());
  addEventListener('resize', fit);
}

// ---------- boot ----------

net = await (await fetch('/api/network')).json();
U = net.unit;
info = lineInfo();
drawStatic();
fit();
setupGestures();
refresh();
setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
