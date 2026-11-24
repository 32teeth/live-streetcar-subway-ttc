// Hand-designed, Beck-style diagram: every segment runs horizontal, vertical or at 45°.
// Coordinates are grid units (x → east, y → south). Stations that are not pinned are spaced
// evenly between the pinned stations on either side of them.

export const UNIT = 36;
export const CANVAS = { x: 0.3, y: 8.6, w: 39.4, h: 29.2 };

// Pinned station / bend / streetcar anchor helpers.
const S = (name, x, y, o = {}) => ({ name, x, y, ...o });
const V = (x, y) => ({ x, y });
// Streetcar anchor: a real-world position (lat/lon, or a subway station by name) pinned to a grid point.
const A = (x, y, ll, o = {}) => ({ x, y, ll, ...o });
const AS = (name, x, y, o = {}) => ({ x, y, st: name, ...o });
const T = (name, x, y, ll, label = 'e') => ({ x, y, ll, term: name, label });

export const RAPID = [
  {
    id: '1', name: 'Yonge–University', color: '#F8B600', ink: '#7a5a00', pattern: '1:0', label: 'w',
    nodes: [
      S('Finch', 20, 16, { label: 'n' }),
      S('Sheppard-Yonge', 20, 18),
      S('Eglinton', 20, 21, { label: 'se' }),
      S('St Clair', 20, 23),
      S('Bloor-Yonge', 20, 26, { label: 'e' }),
      S('Wellesley', 20, 27, { label: 'e' }),
      S('College', 20, 28, { label: 'e' }),
      S('TMU', 20, 29, { label: 'e' }),
      S('Queen', 20, 30, { label: 'e' }),
      S('King', 20, 31, { label: 'e' }),
      V(20, 32),
      S('Union', 19, 33, { label: 'e' }),
      V(18, 32),
      S('St Andrew', 18, 31),
      S('Osgoode', 18, 30),
      S('St Patrick', 18, 29),
      S("Queen's Park", 18, 28),
      S('Museum', 18, 27),
      S('St George', 18, 26),
      S('Spadina', 17, 26),
      S('Dupont', 17, 25),
      V(16, 24),
      S('St Clair West', 16, 23),
      S('Cedarvale', 16, 21, { label: 'ne' }),
      S('Sheppard West', 16, 16),
      S('Finch West', 14, 14, { label: 'ne' }),
      S('Vaughan Metropolitan Centre', 10, 10, { label: 'w' }),
    ],
  },
  {
    id: '2', name: 'Bloor–Danforth', color: '#00A651', ink: '#005a2b', pattern: '2:0', label: 'ne',
    nodes: [
      S('Kipling', 3, 26, { label: 'w' }),
      S('Spadina', 17, 26),
      S('St George', 18, 26),
      S('Bloor-Yonge', 20, 26),
      S('Main Street', 30, 26),
      S('Kennedy', 33, 23, { label: 'e' }),
    ],
  },
  {
    id: '4', name: 'Sheppard', color: '#A8007A', ink: '#5b0042', pattern: '4:0', label: 'ne',
    nodes: [S('Sheppard-Yonge', 20, 18), S('Don Mills', 25, 18, { label: 'e' })],
  },
  {
    id: '5', name: 'Eglinton', color: '#F36F21', ink: '#8a3600', pattern: '5:0',
    label: (st) => ({ 'Forest Hill': 's', Chaplin: 'n', Avenue: 's' })[st.name] || (st.x < 16 ? 'sw' : 'ne'),
    nodes: [
      S('Mount Dennis', 12, 21, { label: 'w' }),
      S('Cedarvale', 16, 21),
      S('Eglinton', 20, 21),
      V(31, 21),
      S('Kennedy', 33, 23),
    ],
  },
  {
    id: '6', name: 'Finch West', color: '#8A8D91', ink: '#444', pattern: '6:0', label: 'sw',
    nodes: [S('Humber College', 2.25, 14, { label: 'n' }), S('Finch West', 14, 14)],
  },
];

export const STREETCAR_COLOR = '#DA291C';

export const STREETCARS = [
  {
    id: '501', name: 'Queen', routes: ['501', '507', '301'], badges: [[33, 30, '501'], [5, 34, '501']],
    nodes: [
      T('Neville Park Loop', 36, 30, [43.67373, -79.28139], 'e'),
      A(23, 30, [43.6591, -79.35]),
      AS('Queen', 20, 30),
      AS('Osgoode', 18, 30),
      A(17, 30, [43.6489, -79.3959]),
      A(16, 30, [43.6473, -79.4037]),
      A(13, 30, [43.6424, -79.4283]),
      A(11, 30, [43.6392, -79.4462]),
      T('Humber Loop', 9, 32, [43.6311, -79.479], 'w'),
      A(7, 34, [43.6038, -79.493]),
      T('Long Branch Loop', 3, 34, [43.59181, -79.54412], 'n'),
    ],
  },
  {
    id: '503', name: 'Kingston Rd', routes: ['503'], badges: [[32.5, 28, '503']],
    nodes: [
      T('Dufferin Gate Loop', 13, 32, [43.6344, -79.42587], 's'),
      V(14, 31),
      A(16, 31, [43.6441, -79.4019]),
      A(17, 31, [43.646, -79.3951]),
      AS('St Andrew', 18, 31),
      AS('King', 20, 31),
      A(22, 31, [43.6529, -79.363]),
      A(23, 31, [43.6557, -79.3583]),
      A(23, 30, [43.6587, -79.3501]),
      A(29, 30, [43.6627, -79.3232]),
      A(31, 28, [43.6698, -79.3112]),
      T('Bingham Loop', 34, 28, [43.68146, -79.285], 'e'),
    ],
  },
  {
    id: '504', name: 'King', routes: ['504', '508', '304'], badges: [[11, 29.4, '504']],
    nodes: [
      AS('Broadview', 23, 26),
      A(23, 30, [43.6591, -79.35]),
      A(23, 31, [43.6557, -79.3583]),
      AS('King', 20, 31),
      AS('St Andrew', 18, 31),
      A(17, 31, [43.646, -79.3951]),
      A(17, 30, [43.6489, -79.3959]),
      A(16, 30, [43.6473, -79.4037]),
      A(13, 30, [43.6424, -79.4283]),
      A(11, 30, [43.6392, -79.4462]),
      AS('Dundas West', 11, 26),
    ],
  },
  {
    id: '504K', name: 'King (Distillery)', routes: [], badges: [],
    nodes: [
      T('Distillery Loop', 24, 31, [43.6531, -79.358], 'e'),
      A(23, 31, [43.6557, -79.3583]),
      AS('King', 20, 31),
      AS('St Andrew', 18, 31),
      A(17, 31, [43.646, -79.3951]),
      A(16, 31, [43.6441, -79.4019]),
      A(13, 31, [43.6391, -79.427]),
      V(12, 31),
      A(11, 30, [43.6385, -79.4458]),
    ],
  },
  {
    id: '505', name: 'Dundas', routes: ['505', '305'], badges: [[15, 29, '505']],
    nodes: [
      AS('Dundas West', 11, 26),
      V(11, 27),
      V(13, 29),
      AS('St Patrick', 18, 29),
      AS('TMU', 20, 29),
      V(23, 29),
      AS('Broadview', 23, 26),
    ],
  },
  {
    id: '506', name: 'Carlton', routes: ['506', '306'], badges: [[12, 28, '506']],
    nodes: [
      T('High Park Loop', 9, 28, [43.64783, -79.45812], 'w'),
      AS("Queen's Park", 18, 28),
      AS('College', 20, 28),
      A(23, 28, [43.6654, -79.3529]),
      A(28, 28, [43.6806, -79.3108]),
      AS('Main Street', 30, 26),
    ],
  },
  {
    id: '509', name: 'Harbourfront', routes: ['509'], badges: [[16.5, 34, '509']],
    nodes: [
      T('Exhibition Loop', 14, 34, [43.63651, -79.41471], 's'),
      A(18, 34, [43.6384, -79.3918]),
      V(19, 34),
      AS('Union', 19, 33),
    ],
  },
  {
    id: '510', name: 'Spadina', routes: ['510', '310'], badges: [[17, 32.3, '510']],
    nodes: [
      AS('Spadina', 17, 26),
      A(17, 31, [43.646, -79.3951]),
      V(17, 33),
      A(18, 34, [43.6384, -79.3918]),
      V(19, 34),
      AS('Union', 19, 33),
    ],
  },
  {
    id: '511', name: 'Bathurst', routes: ['511'], badges: [[16, 32.3, '511']],
    nodes: [
      AS('Bathurst', 16, 26),
      A(16, 28, [43.6563, -79.4078]),
      A(16, 30, [43.6473, -79.4037]),
      A(16, 31, [43.6441, -79.4019]),
      V(16, 33),
      V(15, 34),
      T('Exhibition Loop', 14, 34, [43.63633, -79.41537], 's'),
    ],
  },
  {
    id: '512', name: 'St Clair', routes: ['512', '312'], badges: [[15, 23, '512']],
    nodes: [
      T('Gunns Loop', 13, 23, [43.67191, -79.47184], 'w'),
      AS('St Clair West', 16, 23),
      AS('St Clair', 20, 23),
    ],
  },
];

// Extra named stops drawn on streetcar-only paths.
export const EXTRA_STOPS = [{ name: 'Queens Quay', x: 19, y: 34, label: 'se' }];

// Pale lake polygon along the southern edge.
export const LAKE = [[-60, 35.8], [21, 35.8], [23, 33.8], [27, 33.8], [29.5, 31.6], [100, 31.6], [100, 100], [-60, 100]];
