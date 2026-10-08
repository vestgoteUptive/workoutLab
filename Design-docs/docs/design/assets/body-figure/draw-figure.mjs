#!/usr/bin/env node
// Draws body-figure.svg (T-0315, D-0207). Original art: every point below was placed by hand
// for workoutLab; nothing is traced or copied from a third-party figure (D-0005, D-0192).
//
// Usage: node draw-figure.mjs            writes body-figure.svg next to this file
//        node draw-figure.mjs --stdout   prints it instead
//
// Shapes are point lists in one view's local space (x 0..120, y 0..290, centre line x = 60),
// drawn for the figure's left half (viewer's left) and mirrored. A point [x, y, "c"] is a
// corner; every other point is smoothed (closed Catmull-Rom → cubic Béziers).
// The front view sits at x 4..124 and the back view at x 132..252 of viewBox 0 0 256 290.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VIEW_X = { front: 4, back: 132 };
const r1 = (n) => Math.round(n * 10) / 10;
const fmt = (n) => String(r1(n));

/** Smooth path through points; closed unless `open`. */
export function smoothPath(points, { open = false, dx = 0 } = {}) {
  const p = points.map(([x, y, c]) => ({ x: x + dx, y, c: c === "c" }));
  const n = p.length;
  const at = (i) => (open ? p[Math.max(0, Math.min(n - 1, i))] : p[(i + n) % n]);
  let d = `M${fmt(p[0].x)} ${fmt(p[0].y)}`;
  const segs = open ? n - 1 : n;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = p1.c ? p1 : { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = p2.c ? p2 : { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += `C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return open ? d : `${d}Z`;
}

const mirror = (pts) => pts.map(([x, y, c]) => [120 - x, y, c]);
/** Left contour from the top centre to the bottom centre → a symmetric closed outline. */
const symmetric = (left) => [...left, ...mirror(left.slice(1, -1)).reverse()];

// ---------------------------------------------------------------- silhouette (both views)
const SILHOUETTE = symmetric([
  [60, 3],
  [52.5, 4.5],
  [47.5, 10],
  [46, 19],
  [47.3, 29],
  [50.5, 36],
  [53.5, 40.5],
  [53.6, 45.5],
  [47, 50],
  [37, 52.5],
  [27.5, 55],
  [21.3, 59],
  [17.6, 67],
  [16.5, 78],
  [15.6, 92],
  [14.6, 106],
  [13.6, 118],
  [12, 130],
  [10.6, 145],
  [10.6, 159],
  [11.6, 167.5],
  [9.6, 175],
  [9.4, 185],
  [12.6, 192.5],
  [17.4, 192],
  [19.4, 185],
  [20.2, 176],
  [21.3, 168.5],
  [23.6, 155],
  [25.6, 140],
  [27.6, 126],
  [29.2, 115],
  [30.3, 103],
  [31.3, 91],
  [33.2, 81, "c"],
  [35, 92],
  [36.6, 108],
  [37.6, 124],
  [36.6, 136],
  [34.6, 148],
  [33.2, 160],
  [32.6, 176],
  [34, 195],
  [36, 212],
  [37.6, 224],
  [37.6, 236],
  [36.2, 248],
  [36.6, 260],
  [39, 271],
  [41, 277.5],
  [38.4, 282.5],
  [38.4, 287],
  [47, 288.6],
  [52.4, 287],
  [53.6, 281],
  [53.2, 275],
  [53.5, 262],
  [54.6, 248],
  [55.6, 236],
  [56.2, 224],
  [57.2, 205],
  [58.2, 185],
  [59, 172],
  [60, 163, "c"],
]);

// ---------------------------------------------------------------- shared limb regions
const UPPER_ARM = [
  [16.9, 94],
  [22.6, 99.6, "c"],
  [27.6, 92.5],
  [30.4, 91.5],
  [29.9, 103],
  [28.6, 114],
  [25.4, 119.6],
  [19.4, 120.6],
  [15.6, 116.5],
  [15.9, 105],
];
const FOREARM = [
  [14.8, 125.4],
  [21, 123.6],
  [27, 124.6],
  [26.4, 135],
  [24.6, 149],
  [22.2, 162],
  [17, 165.4],
  [12.6, 163],
  [11.9, 149],
  [12.7, 135],
];

// ---------------------------------------------------------------- front view
const FRONT = {
  regions: [
    {
      area: "shoulders",
      pts: [
        [38.5, 54],
        [29.4, 56.2],
        [22.4, 60.2],
        [18.9, 68],
        [18, 79],
        [19.3, 89],
        [22.6, 96.4, "c"],
        [26.4, 88],
        [29.8, 78],
        [33, 67],
        [36.6, 58.6],
      ],
    },
    {
      area: "chest",
      pts: [
        [58.6, 57.6],
        [48.5, 55.6],
        [40.8, 57.3],
        [36.2, 63.5],
        [32.8, 75],
        [33.6, 83.4],
        [39, 88.8],
        [49, 90.8],
        [58.6, 89],
      ],
    },
    { area: "arms", pts: UPPER_ARM },
    { area: "arms", pts: FOREARM },
    {
      area: "core",
      pts: [
        [58.6, 93.4],
        [51, 93.6],
        [47.6, 99],
        [47.2, 114],
        [47.6, 129],
        [49.4, 141],
        [53.6, 148.8],
        [58.6, 151.6],
      ],
    },
    {
      area: "core",
      pts: [
        [44.8, 95.5],
        [39.4, 92.6],
        [37.4, 103],
        [38.2, 116],
        [38.4, 128],
        [37.4, 137.5],
        [41, 140.5],
        [45.2, 131],
        [45.4, 112],
      ],
    },
    {
      area: "quads",
      pts: [
        [38.2, 152],
        [35.2, 160],
        [34.4, 176],
        [35.6, 195],
        [38.2, 211],
        [41.8, 220.5],
        [46.4, 222.6],
        [50.6, 219],
        [52.6, 208],
        [52.6, 192],
        [50.4, 175],
        [46, 162],
        [41.8, 154],
      ],
    },
  ],
  body: [
    // hip flexor
    [
      [39.6, 143.6],
      [44.6, 141.8],
      [50.2, 149],
      [55.6, 156.6],
      [53, 159.8],
      [47.6, 157.6],
      [42.4, 151],
    ],
    // inner thigh (adductors)
    [
      [49.6, 163],
      [56, 162.6, "c"],
      [58.2, 172],
      [57.5, 186],
      [55.6, 198],
      [54.2, 191],
      [53.4, 179],
      [51.8, 169],
    ],
    // knee
    [
      [42, 228],
      [46.4, 225.4],
      [51.4, 227],
      [52.8, 232],
      [50.4, 236.4],
      [45.6, 237],
      [42, 233.4],
    ],
    // shin (tibialis)
    [
      [40.4, 242],
      [44, 239.6],
      [46.6, 242.6],
      [46.2, 256],
      [44.6, 268],
      [42.6, 266],
      [40.2, 254],
    ],
  ],
  seams: [
    // pectoral split, upper and lower chest
    { area: "chest", pts: [
        [36.8, 69],
        [44, 66.2],
        [52, 65.8],
        [57.6, 67],
    ] },
    // deltoid heads (front | side)
    { area: "shoulders", pts: [
        [31.4, 58.4],
        [27.2, 66],
        [24.6, 77],
        [23.6, 88],
    ] },
    // biceps
    { area: "arms", pts: [
        [27.2, 97],
        [25.2, 104],
        [24.6, 112],
        [22.6, 118],
    ] },
    // abdominal grid
    { area: "core", pts: [
        [48, 106.6],
        [53, 105.2],
        [57.8, 105.8],
    ] },
    { area: "core", pts: [
        [47.8, 120.6],
        [53, 119.2],
        [57.8, 119.8],
    ] },
    { area: "core", pts: [
        [48.6, 134.6],
        [53, 133.4],
        [57.8, 134],
    ] },
    // quadriceps heads: rectus femoris | vastus lateralis, vastus medialis
    { area: "quads", pts: [
        [41.2, 156],
        [41, 175],
        [42.6, 195],
        [45.4, 214],
    ] },
    { area: "quads", pts: [
        [51.8, 199],
        [48.6, 207],
        [47.4, 216],
    ] },
  ],
};

// ---------------------------------------------------------------- back view
const BACK = {
  regions: [
    {
      // trapezius, upper and mid (rhomboids sit under it)
      area: "back",
      pts: [
        [58.6, 42.5],
        [54.6, 46],
        [48.4, 50.6],
        [39, 53.6],
        [34.6, 56.6],
        [39.6, 63],
        [44.4, 73],
        [49.4, 85],
        [54.6, 94.6],
        [58.6, 99.6],
      ],
    },
    {
      // latissimus dorsi
      area: "back",
      pts: [
        [47.4, 89.4],
        [42.4, 77.6],
        [37.8, 68.6],
        [34.6, 67.2],
        [33.8, 78],
        [35.4, 93],
        [37.4, 110],
        [39.8, 126],
        [44.2, 133],
        [50, 131],
        [51.8, 117],
        [51, 100],
      ],
    },
    {
      // spinal erectors
      area: "back",
      pts: [
        [58.6, 103.6],
        [55.8, 103.2],
        [53.6, 113],
        [52.8, 127],
        [54.2, 137.6],
        [58.6, 141.2],
      ],
    },
    {
      area: "shoulders",
      pts: [
        [34.2, 55.8],
        [27.6, 56.6],
        [22, 60.6],
        [18.9, 68.4],
        [18, 79],
        [19.3, 89],
        [22.6, 96.4, "c"],
        [26.2, 87],
        [29.6, 76],
        [31.2, 66],
        [33.2, 60],
      ],
    },
    { area: "arms", pts: UPPER_ARM },
    { area: "arms", pts: FOREARM },
    {
      area: "glutes",
      pts: [
        [58.6, 149.4],
        [52.4, 144.8],
        [44.2, 143.4],
        [38, 146.4],
        [34.8, 155],
        [34.6, 165.4],
        [37.4, 174.6],
        [44.4, 179.8],
        [52.2, 179.6],
        [57.4, 173.6],
        [58.6, 162],
      ],
    },
    {
      area: "hamstrings",
      pts: [
        [36, 184.4],
        [42.4, 183.4],
        [50.4, 184],
        [56.2, 186.4],
        [56.6, 200],
        [55, 213],
        [51, 223.4],
        [47.4, 217, "c"],
        [43.4, 223.4],
        [39, 215],
        [35.6, 200],
      ],
    },
    {
      // gastrocnemius and soleus
      area: "calves",
      pts: [
        [39.2, 237],
        [43.8, 233.2],
        [47.2, 235.2, "c"],
        [50.6, 233.2],
        [54.6, 236.6],
        [55, 247],
        [53.6, 258],
        [51, 266.4],
        [47.2, 262.6, "c"],
        [43.4, 266.4],
        [39.6, 258],
        [37.4, 247],
      ],
    },
  ],
  body: [
    // back of the knee
    [
      [41.6, 227.6],
      [47.2, 226],
      [52.6, 227.6],
      [51.6, 230.6],
      [47.2, 229.8],
      [42.6, 230.6],
    ],
    // achilles and heel
    [
      [45.4, 270],
      [49, 270],
      [49.6, 280],
      [47.2, 284.6],
      [44.8, 280],
    ],
  ],
  seams: [
    // trapezius, upper | mid
    { area: "back", pts: [
        [40.6, 54.6],
        [46.4, 56.8],
        [52.4, 58],
        [57.6, 58.2],
    ] },
    // rear delt
    { area: "shoulders", pts: [
        [29.4, 60],
        [25.4, 70],
        [23.6, 82],
    ] },
    // triceps horseshoe
    { area: "arms", pts: [
        [19.6, 101],
        [21.4, 110],
        [25.6, 112],
        [27.4, 101],
    ] },
    // gluteus medius | maximus
    { area: "glutes", pts: [
        [36.2, 151.6],
        [42, 150.2],
        [48.4, 152.4],
    ] },
    // gastrocnemius heads
    { area: "calves", pts: [
        [47.2, 239],
        [46.8, 248],
        [47.2, 257],
    ] },
  ],
};

const indent = (s, n) => `${" ".repeat(n)}${s}`;

function drawView(name, view) {
  const dx = VIEW_X[name];
  const out = [indent(`<g class="wl-fig__view" data-view="${name}">`, 2)];
  out.push(indent(`<path class="wl-fig__body wl-fig__silhouette" d="${smoothPath(SILHOUETTE, { dx })}"/>`, 4));
  for (const pts of view.body) {
    for (const side of [pts, mirror(pts)]) {
      out.push(indent(`<path class="wl-fig__body" d="${smoothPath(side, { dx })}"/>`, 4));
    }
  }
  for (const { area, pts } of view.regions) {
    for (const side of [pts, mirror(pts)]) {
      out.push(
        indent(
          `<path class="wl-fig__region" data-area="${area}" d="${smoothPath(side, { dx })}"/>`,
          4,
        ),
      );
    }
  }
  for (const { area, pts } of view.seams) {
    for (const side of [pts, mirror(pts)]) {
      const d = smoothPath(side, { open: true, dx });
      out.push(indent(`<path class="wl-fig__seam" data-seam="${area}" d="${d}"/>`, 4));
    }
  }
  out.push(indent("</g>", 2));
  return out;
}

export function drawFigure() {
  return [
    "<!-- workoutLab body figure (T-0315, D-0207). Original art, LicenseRef-workoutLab.",
    "     Generated by draw-figure.mjs. Colours come only from CSS classes (design tokens). -->",
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 290" class="wl-fig" aria-hidden="true" focusable="false">',
    "  <defs>",
    // 7.25 units = 5 px and 2.2 units = 1.5 px at the 200 px UF-04.2 size (290 units tall).
    '    <pattern id="wl-fig-hatch" patternUnits="userSpaceOnUse" width="7.25" height="7.25" patternTransform="rotate(45)">',
    '      <rect class="wl-fig__hatch-ground" width="7.25" height="7.25"/>',
    '      <rect class="wl-fig__hatch-stripe" width="2.2" height="7.25"/>',
    "    </pattern>",
    "  </defs>",
    ...drawView("front", FRONT),
    ...drawView("back", BACK),
    "</svg>",
    "",
  ].join("\n");
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const svg = drawFigure();
  if (process.argv.includes("--stdout")) process.stdout.write(svg);
  else writeFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "body-figure.svg"), svg);
}
