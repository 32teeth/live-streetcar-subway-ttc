// Minimal protobuf reader for the GTFS-realtime vehicle-position feed, so the browser build
// needs no protobuf library. Output matches the shape of gtfs-realtime-bindings' FeedMessage.

function reader(buf) {
  let pos = 0;
  const varint = () => {
    let lo = 0, shift = 0, b;
    do {
      b = buf[pos++];
      lo += (b & 0x7f) * 2 ** shift;
      shift += 7;
    } while (b & 0x80);
    return lo;
  };
  return {
    get done() { return pos >= buf.length; },
    // yields [fieldNumber, value] where value is a number (varint/fixed32 as float bits) or a sub-buffer
    next() {
      const tag = varint();
      const field = Math.floor(tag / 8);
      const type = tag & 7;
      if (type === 0) return [field, varint(), 'v'];
      if (type === 5) {
        const v = new DataView(buf.buffer, buf.byteOffset + pos, 4);
        pos += 4;
        return [field, v, 'f'];
      }
      if (type === 1) { pos += 8; return [field, null, 'skip']; }
      if (type === 2) {
        const len = varint();
        const sub = buf.subarray(pos, pos + len);
        pos += len;
        return [field, sub, 'b'];
      }
      throw new Error(`unsupported wire type ${type}`);
    },
  };
}

const str = (b) => new TextDecoder().decode(b);

function each(buf, fn) {
  const r = reader(buf);
  while (!r.done) fn(...r.next());
}

export function decodeFeed(bytes) {
  const feed = { header: { timestamp: 0 }, entity: [] };
  each(bytes, (f, v) => {
    if (f === 1) each(v, (hf, hv) => { if (hf === 3) feed.header.timestamp = hv; });
    else if (f === 2) feed.entity.push(decodeEntity(v));
  });
  return feed;
}

function decodeEntity(buf) {
  const e = { id: '' };
  each(buf, (f, v) => {
    if (f === 1) e.id = str(v);
    else if (f === 4) e.vehicle = decodeVehicle(v);
  });
  return e;
}

function decodeVehicle(buf) {
  const veh = {};
  each(buf, (f, v) => {
    if (f === 1) {
      veh.trip = {};
      each(v, (tf, tv) => { if (tf === 5) veh.trip.routeId = str(tv); });
    } else if (f === 2) {
      veh.position = {};
      each(v, (pf, pv) => {
        const x = pv.getFloat32(0, true);
        if (pf === 1) veh.position.latitude = x;
        else if (pf === 2) veh.position.longitude = x;
        else if (pf === 3) veh.position.bearing = x;
        else if (pf === 5) veh.position.speed = x;
      });
    } else if (f === 5) veh.timestamp = v;
    else if (f === 8) {
      veh.vehicle = {};
      each(v, (vf, vv) => { if (vf === 1) veh.vehicle.id = str(vv); });
    }
  });
  return veh;
}
