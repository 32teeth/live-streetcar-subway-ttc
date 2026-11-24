# Live TTC — Subway, LRT & Streetcars

A small web app that shows where Toronto's subway trains, Line 5/6 LRT trains and streetcars are right now, drawn on a hand-built Beck-style (London Underground) diagram. Each route is a dark band holding two lighter tracks, one per direction, and every vehicle is a white dot with a coloured border riding in the track for the way it's heading (keeping right, as traffic does). No buses.

## How it works

| Mode | Source | Accuracy |
| --- | --- | --- |
| Streetcars (501–512) | TTC GTFS-realtime vehicle positions (`gtfsrt.ttc.ca`) | Real GPS, snapped onto the drawn route |
| Subway (Lines 1, 2, 4) and LRT (Lines 5, 6) | TTC next-train times (`ntas.ttc.ca`), polled per platform | **Estimated.** The TTC publishes no GPS for rail, so positions are reconstructed from arrival times (hover a dot to see which kind it is) |

Rail positions are rebuilt by walking each platform's predicted arrivals back along the line using typical station-to-station run times from the schedule data. The same train appears in the predictions of every station downstream, so duplicates are merged.

The diagram itself is schematic: every segment is horizontal, vertical or 45°. Station order and run times come from the TTC's static GTFS data; the geometry is hand-designed in [`src/layout.mjs`](src/layout.mjs). Streetcar GPS fixes are projected onto the real route shape and then mapped onto the drawn one through anchor points.

## Run it

Requires Node 22.15 or newer.

```sh
npm install
npm start          # http://localhost:3000   (PORT=3100 npm start to change)
```

`npm start` uses `--use-system-ca` so Node trusts your OS certificate store. This matters on networks with TLS inspection, where the TTC endpoints otherwise fail with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`.

Use it: drag to pan, scroll or pinch to zoom, double-click to reset. Hover a dot for details.

## Rebuild the schedule data

`data/gtfs-derived.json` (station order, run times, reference streetcar shapes) is committed so the app runs out of the box. To regenerate it from the latest TTC schedule:

```sh
npm run build:data   # downloads ~60 MB of GTFS from City of Toronto Open Data into .cache/
```

## Change the diagram

Everything visual is in [`src/layout.mjs`](src/layout.mjs): station positions, bends, label sides, streetcar paths and anchor points. Anchors pin a point on the drawn streetcar line to a real-world location so live GPS lands in the right place. The tests fail if a pinned station isn't in the schedule data or an anchor drifts away from its route.

## Project layout

```
server.mjs          Entry point: loads data, starts polling, listens
src/app.mjs         Express app: /api/network (drawing data), /api/vehicles (live dots)
src/layout.mjs      Hand-designed diagram
src/network.mjs     Combines layout + GTFS into drawing data and lookup models
src/subway.mjs      NTAS polling and train-position estimation
src/streetcar.mjs   GTFS-realtime streetcar feed
src/geo.mjs         Polyline helpers
scripts/build-data.mjs  Builds data/gtfs-derived.json
public/             Static front end (SVG, no framework)
test/               node:test suites (geometry, layout rules, feeds, HTTP API)
```

## Test

```sh
npm test
```

The tests need no network: the TTC feeds are mocked, including a real encoded GTFS-realtime payload. Besides unit tests, they check the diagram rules (every segment horizontal, vertical or 45°; stations in schedule order; shared stations at one point) so a layout edit that breaks the map fails fast.

## License

Code and diagram are released under [CC BY-SA 4.0](LICENSE.md). See the [Code of Conduct](CODE_OF_CONDUCT.md).

## Data and disclaimer

Schedule data: [TTC Routes and Schedules](https://open.toronto.ca/dataset/merged-gtfs-ttc-routes-and-schedules/), City of Toronto Open Data, under the [Open Government Licence – Toronto](https://open.toronto.ca/open-data-license/). Live feeds are the TTC's public, undocumented endpoints and may change or disappear without notice.

This is an unofficial personal project, not affiliated with or endorsed by the Toronto Transit Commission. The diagram is schematic and not to scale; subway and LRT positions are estimates. Don't rely on it for travel decisions.
