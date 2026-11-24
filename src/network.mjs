// Combines the hand-designed layout with GTFS-derived data into
//  • `client`: static drawing data for the browser
//  • `model`: server-side lookups used to place live vehicles on the diagram
import { RAPID, STREETCARS, STREETCAR_COLOR, EXTRA_STOPS, LAKE, UNIT, CANVAS } from './layout.mjs';
import { geoPolyline, gridPolyline, snapToGeo, pointAt, interpolate } from './geo.mjs';

const isPin = (n) => typeof n.name === 'string';

function buildRapidLine(line, derived) {
  const pattern = derived.patterns[line.pattern];
  const names = pattern.names;
  const poly = gridPolyline(line.nodes.map((n) => [n.x, n.y]));

  // arclength of every pinned station, then even spacing for the stations in between
  const pins = [];
  let cursor = 0;
  for (const n of line.nodes) {
    if (!isPin(n)) { cursor++; continue; }
    const idx = names.indexOf(n.name);
    if (idx < 0) throw new Error(`Line ${line.id}: pinned station "${n.name}" is not in the GTFS pattern`);
    pins.push({ idx, s: poly.cum[cursor], node: n });
    cursor++;
  }
  if (pins[0].idx !== 0 || pins.at(-1).idx !== names.length - 1) throw new Error(`Line ${line.id}: first/last station must be pinned`);
  for (let i = 1; i < pins.length; i++) if (pins[i].idx <= pins[i - 1].idx) throw new Error(`Line ${line.id}: pins out of order at ${pins[i].node.name}`);

  const stationS = interpolate;
  const knots = pins.map((p) => [p.idx, p.s]);
  const pinByName = new Map(pins.map((p) => [p.node.name, p.node]));
  const stations = names.map((name, idx) => {
    const s = stationS(knots, idx);
    const p = pointAt(poly, s);
    const pinned = pinByName.get(name);
    return { name, s, x: p.x, y: p.y, angle: p.angle, label: pinned?.label, pinned: Boolean(pinned) };
  });
  return { poly, stations };
}

function buildStreetcar(sc, derived) {
  const poly = gridPolyline(sc.nodes.map((n) => [n.x, n.y]));
  const ref = derived.shapes[sc.id];
  let real = geoPolyline(ref);

  const anchors = [];
  sc.nodes.forEach((n, i) => {
    const ll = n.st ? [derived.stations[n.st].lat, derived.stations[n.st].lon] : n.ll;
    if (!ll) return;
    anchors.push({ sGrid: poly.cum[i], ll, name: n.st || n.term || `${n.x},${n.y}` });
  });

  const project = (r) => anchors.map((a) => ({ ...a, ...snapToGeo(r, a.ll[0], a.ll[1]) }));
  let proj = project(real);
  if (proj[0].s > proj.at(-1).s) {
    real = geoPolyline([...ref].reverse());
    proj = project(real);
  }
  // monotonic knots (real arclength → grid arclength); anchors that wander off-route are reported
  const knots = [];
  const warnings = [];
  for (const a of proj) {
    if (a.dist > 350) warnings.push(`${sc.id}: anchor ${a.name} is ${Math.round(a.dist)} m from the route shape`);
    if (knots.length && a.s < knots.at(-1)[0] - 1) { warnings.push(`${sc.id}: anchor ${a.name} is out of order along the route`); continue; }
    knots.push([a.s, a.sGrid]);
  }
  return { poly, real, knots, warnings };
}

export function buildNetwork(derived) {
  const rapidModels = {};
  const rapidClient = RAPID.map((line) => {
    const { poly, stations } = buildRapidLine(line, derived);
    rapidModels[line.id] = { poly, stations, stationS: Object.fromEntries(stations.map((s) => [s.name, s.s])) };
    return { id: line.id, name: line.name, color: line.color, ink: line.ink, kind: 'rapid', path: poly.pts, stations, labelFn: line.label };
  });

  // one entry per station name, with its label placement
  const stationMap = new Map();
  for (const l of rapidClient) {
    for (const st of l.stations) {
      const side = st.label || (typeof l.labelFn === 'function' ? l.labelFn(st) : l.labelFn);
      const cur = stationMap.get(st.name);
      if (!cur) stationMap.set(st.name, { name: st.name, x: st.x, y: st.y, lines: [l.id], side: st.label ? side : null, defaultSide: side });
      else {
        cur.lines.push(l.id);
        if (st.label && !cur.side) cur.side = side;
      }
    }
  }
  const stations = [...stationMap.values()].map((s) => ({
    name: s.name, x: s.x, y: s.y, lines: s.lines, interchange: s.lines.length > 1, side: s.side || s.defaultSide,
  }));

  const streetcarModels = {};
  const warnings = [];
  const streetcarClient = STREETCARS.map((sc) => {
    const m = buildStreetcar(sc, derived);
    streetcarModels[sc.id] = { ...m, routes: sc.routes };
    warnings.push(...m.warnings);
    const terminals = sc.nodes.filter((n) => n.term).map((n) => ({ name: n.term, x: n.x, y: n.y, side: n.label }));
    return {
      id: sc.id, name: sc.name, color: STREETCAR_COLOR, kind: 'streetcar', path: m.poly.pts,
      terminals, badges: sc.badges.map(([x, y, text]) => ({ x, y, text })),
    };
  });

  const client = {
    unit: UNIT,
    canvas: CANVAS,
    lake: LAKE,
    streetcarColor: STREETCAR_COLOR,
    rapid: rapidClient.map(({ labelFn, ...l }) => ({ ...l, stations: l.stations.map(({ label, pinned, ...s }) => s) })),
    streetcars: streetcarClient,
    stations,
    extraStops: EXTRA_STOPS,
  };

  const routeToLines = {};
  for (const [id, m] of Object.entries(streetcarModels)) for (const r of m.routes) (routeToLines[r] ||= []).push(id);
  for (const id of Object.keys(streetcarModels)) if (id === '504K') routeToLines['504'].push('504K');

  return { client, model: { rapid: rapidModels, streetcars: streetcarModels, routeToLines, warnings } };
}

/**
 * Place a lat/lon fix for a streetcar route on the diagram; null when it is off the known alignment.
 * With a compass bearing, also returns the heading (radians, SVG frame) along the drawn line.
 */
export function placeStreetcar(model, routeId, lat, lon, maxMeters = 500, bearingDeg = null) {
  let best = null;
  for (const lineId of model.routeToLines[routeId] || []) {
    const m = model.streetcars[lineId];
    const hit = snapToGeo(m.real, lat, lon);
    if (!best || hit.dist < best.dist) best = { ...hit, lineId, m };
  }
  if (!best || best.dist > maxMeters) return null;
  const p = pointAt(best.m.poly, interpolate(best.m.knots, best.s));
  let angle = null;
  if (bearingDeg != null) {
    const rad = (bearingDeg * Math.PI) / 180;
    const r = pointAt(best.m.real, best.s); // metres, x east / y north
    const along = Math.sin(rad) * Math.cos(r.angle) + Math.cos(rad) * Math.sin(r.angle);
    angle = along < 0 ? p.angle + Math.PI : p.angle;
  }
  return { lineId: best.lineId, x: p.x, y: p.y, off: best.dist, angle };
}
