// The batching line, built for any camera. Runs in Node (first frame) and in the page
// (orbit and animation), where the kit functions are globals and the import is stripped.
import { iso, depthOf, towardViewer, pathOf, slabOf, cylinder, extrude, insetPlan, planOutline, lineOnTop, segment, ring, corners, solidSvg, lineSvg, dotsSvg, faceTextSvg, sideArc, sideSeam, knurl, topTicks, radialTicks, haloOf, fitProjection, boxCorners } from "../vendor/anatomy/kit/iso-kit.mjs";
import { BATCHES, TYPES, UNITS, ALLOC, recipeOf, remainingAt, emptyAt, activeAt, UNIT_KG } from "./model.mjs";

// ---- world layout (1 unit ≈ 1 cm) -------------------------------------------------------
export const W = 960;
export const H = 700;

const BED = 110; // flow-rack roller bed
const BIN = 90; // palox plan
const BIN_Z = 122; // palox floor (on its pallet)
const BIN_H = 70;
const PITCH = 100;
const HEAD = -45; // lane head stop face
const SPARE = 1; // an unopened unit queued behind the last one used

export const LANES = TYPES.map((type, index) => ({
  type: type.key,
  x: -370 + index * 125,
  slots: UNITS[index].count + SPARE,
}));

const BELT = { x0: -450, x1: -82, y: 0, half: 26, top: 100 };
const MIX = { x: -70, y: -55, w: 140, d: 110, r: 10, z0: 42, top: 96 };
const SPOUT = { x0: 70, x1: 162, top: 82, low: 68 };
const STATION = 150;
const TOTE = 76;
const TOTE_PITCH = 86;
const TOTE_Z = 14;
const TOTE_H = 54;
const LINE_END = STATION + TOTE_PITCH * BATCHES + 10;
const FLOOR_RING = [
  [-480, -680],
  [-305, -680],
  [-305, -480],
  [-180, -480],
  [-180, -280],
  [-40, -280],
  [-40, -150],
  [LINE_END + 20, -150],
  [LINE_END + 20, 120],
  [-480, 120],
];

// Phases of one batch, in batch time u ∈ [0, 1).
export const PHASE = { transfer: 0.66, mix: 0.78, discharge: 0.88 };

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

// Model time (batches of material drawn) for figure time g.
export function drawnAt(g) {
  if (g >= BATCHES) return BATCHES;
  const n = Math.floor(g);
  return n + clamp((g - n) / PHASE.transfer, 0, 1);
}
// Figure time at which model time e is reached.
const figureAt = (e) => {
  const n = Math.min(BATCHES - 1, Math.floor(e - 1e-9));
  return n + PHASE.transfer * (e - n);
};

// ---- colours -----------------------------------------------------------------------------
const BASE = { G: [24, 74, 52], M: [214, 52, 58], C: [96, 40, 56] };
export function colourOf(id) {
  if (id === "carry") return "var(--carry)";
  const [h, s, l] = BASE[id[0]];
  const i = Number(id.slice(1)) - 1;
  const shift = [0, 10, -7, 5, -3, 8][i % 6];
  return `hsl(${h + (i % 2 ? 6 : 0)} ${s}% ${l + shift}%)`;
}

// ---- camera ------------------------------------------------------------------------------
const EXTENT = [...FLOOR_RING.flatMap(([x, y]) => [[x, y, -14], [x, y, 0]]), [-370, -650, BIN_Z + BIN_H], [-415, -650, BIN_Z + BIN_H], [LANES[2].x, HEAD, BIN_Z + BIN_H + 10], [0, -150, 140]];
export function projectionOf(azimuth, elevation) {
  return fitProjection(EXTENT, W, H, { pad: 18, azimuth, elevation });
}

// ---- painter's order ---------------------------------------------------------------------
// Items carry a world box [x0, y0, z0, x1, y1, z1]. Where two overlap on screen, the one
// beyond a separating plane is drawn first; a topological sort settles the order.
function hullOf(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of pts.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
function hullsOverlap(a, b) {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const nx = q[1] - p[1], ny = p[0] - q[0];
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const v of a) { const d = v[0] * nx + v[1] * ny; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
      for (const v of b) { const d = v[0] * nx + v[1] * ny; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
      const len = Math.hypot(nx, ny) || 1;
      if (a1 <= b0 + 0.3 * len || b1 <= a0 + 0.3 * len) return false;
    }
  }
  return true;
}
function screenBox(box, P) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const x of [box[0], box[3]]) for (const y of [box[1], box[4]]) for (const z of [box[2], box[5]]) {
    const [sx, sy] = iso([x, y, z], P);
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  return [x0, y0, x1, y1];
}
function before(a, b, view) {
  const [vx, vy] = view;
  const eps = 0.01;
  if (a.box[5] <= b.box[2] + eps) return true;
  if (b.box[5] <= a.box[2] + eps) return false;
  const sx = a.box[3] <= b.box[0] + eps ? 1 : b.box[3] <= a.box[0] + eps ? -1 : 0;
  const sy = a.box[4] <= b.box[1] + eps ? 1 : b.box[4] <= a.box[1] + eps ? -1 : 0;
  const cx = sx * vx, cy = sy * vy;
  const pick = Math.abs(cx) >= Math.abs(cy) ? cx : cy;
  if (pick !== 0) return pick > 0;
  return a.depth < b.depth;
}
export function sortItems(items, P) {
  const view = towardViewer(P);
  for (const item of items) {
    item.screen = screenBox(item.box, P);
    const corners8 = [];
    for (const x of [item.box[0], item.box[3]]) for (const y of [item.box[1], item.box[4]]) for (const z of [item.box[2], item.box[5]]) corners8.push(iso([x, y, z], P));
    item.hull = hullOf(corners8);
    const [x0, y0, z0, x1, y1, z1] = item.box;
    item.depth = depthOf([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], P) + (item.bias ?? 0);
  }
  items.sort((a, b) => a.depth - b.depth);
  const after = items.map(() => []);
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i].screen, b = items[j].screen;
      if (a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1]) continue;
      if (!hullsOverlap(items[i].hull, items[j].hull)) continue;
      if (before(items[i], items[j], view)) after[i].push(j);
      else after[j].push(i);
    }
  }
  const state = items.map(() => 0);
  const out = [];
  const visit = (i) => {
    if (state[i]) return;
    state[i] = 1;
    for (const j of after[i]) visit(j);
    out.push(items[i]);
  };
  for (let i = items.length - 1; i >= 0; i--) visit(i);
  return out.reverse();
}

// ---- small helpers -----------------------------------------------------------------------
const S = (paths, style) => solidSvg(paths, style);
const L = (d, style) => lineSvg(d, style);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scaleV = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const facing = (n, P) => {
  const [vx, vy] = towardViewer(P);
  return n[0] * vx + n[1] * vy;
};
// The face of a box (±x or ±y) that best faces the viewer among the given candidates.
const bestFace = (P, options) => options.reduce((best, n) => (facing(n, P) > facing(best, P) ? n : best));
// A quad on a vertical face: centre c, outward normal n (floor), width w along the face, height h.
function faceQuad(c, n, w, h, P, lift = 0.2) {
  const t = [n[1], -n[0], 0];
  const o = add(c, [n[0] * lift, n[1] * lift, 0]);
  const pts = [add(o, add(scaleV(t, -w / 2), [0, 0, h / 2])), add(o, add(scaleV(t, w / 2), [0, 0, h / 2])), add(o, add(scaleV(t, w / 2), [0, 0, -h / 2])), add(o, add(scaleV(t, -w / 2), [0, 0, -h / 2]))];
  return pts.map((p) => iso(p, P));
}
function faceText(c, n, text, size, P, tone = "hi") {
  const t = [n[1], -n[0], 0];
  const o = add(c, [n[0] * 0.4, n[1] * 0.4, 0]);
  const p0 = iso(o, P);
  const pu = iso(add(o, t), P);
  const pv = iso(add(o, [0, 0, -1]), P);
  const m = [pu[0] - p0[0], pu[1] - p0[1], pv[0] - p0[0], pv[1] - p0[1], p0[0], p0[1]].map((v) => Math.round(v * 1000) / 1000);
  return faceTextSvg(`matrix(${m.join(" ")})`, text, { size, tone, anchor: "middle" });
}
const poly = (pts, cls, extra = "") => `<path class="${cls}" d="${pathOf(pts, true)}"${extra}/>`;

// An open-topped container: walls already drawn as a solid; this draws the opening, the far
// inner walls down to the contents and the contents' surface, clipped to the opening.
function opening(id, plan, top, level, fill, P, { floor = top - 60 } = {}) {
  const inner = insetPlan(plan, 3.2);
  const rim = [[inner.x, inner.y], [inner.x + inner.w, inner.y], [inner.x + inner.w, inner.y + inner.d], [inner.x, inner.y + inner.d]];
  const mouth = rim.map(([x, y]) => iso([x, y, top], P));
  const z = Math.max(floor, Math.min(top - 0.5, level));
  const [vx, vy] = towardViewer(P);
  const out = [`<clipPath id="${id}"><path d="${pathOf(mouth, true)}"/></clipPath><g clip-path="url(#${id})">`];
  out.push(poly(mouth, "in-dark"));
  // far walls: inward normal points toward the viewer
  const walls = [
    { a: rim[0], b: rim[1], n: [0, 1] },
    { a: rim[1], b: rim[2], n: [-1, 0] },
    { a: rim[2], b: rim[3], n: [0, -1] },
    { a: rim[3], b: rim[0], n: [1, 0] },
  ];
  for (const wall of walls) {
    const f = wall.n[0] * vx + wall.n[1] * vy;
    if (f <= 0) continue;
    const quad = [iso([...wall.a, top], P), iso([...wall.b, top], P), iso([...wall.b, z], P), iso([...wall.a, z], P)];
    out.push(poly(quad, "in-wall", ` data-shade="${f > 0.7 ? 1 : 0}"`));
  }
  if (fill && level > floor + 0.05) {
    const surface = rim.map(([x, y]) => iso([x, y, z], P));
    out.push(poly(surface, "meat", ` style="fill:${fill}"`));
    out.push(L(pathOf(surface, true), { tone: "faint" }));
  }
  out.push("</g>");
  out.push(L(pathOf(mouth, true), { tone: "lo" }));
  return out.join("");
}

// ---- parts ---------------------------------------------------------------------------------
function floorItem(P) {
  const out = [];
  const shadow = extrude(FLOOR_RING, -14, 14, P, { convex: false });
  out.push(`<path class="iso-halo" d="${shadow.fill}"/>`);
  out.push(S(shadow, { tone: "mid", crease: "lo" }));
  // painted walkway lines, drain grate, anchor screws
  out.push(L([62, 70, -140, -132].map((y) => lineOnTop([-480, y], [LINE_END + 20, y], 0, P)).join(""), { tone: "faint" }));
  const grate = { x: 40, y: 62, w: 70, d: 34, r: 2 };
  out.push(S(slabOf(grate, 0, 0.3, P, 2), { tone: "lo", crease: "none" }));
  for (let x = grate.x + 5; x < grate.x + grate.w - 2; x += 5) out.push(L(lineOnTop([x, grate.y + 2], [x, grate.y + grate.d - 2], 0.3, P), { tone: "faint" }));
  out.push(L(lineOnTop([grate.x + 2, grate.y + 2], [grate.x + grate.w - 2, grate.y + 2], 0.3, P) + lineOnTop([grate.x + 2, grate.y + grate.d - 2], [grate.x + grate.w - 2, grate.y + grate.d - 2], 0.3, P), { tone: "faint" }));
  // batch ruler along the tote line: one major tick per tote slot
  const strip = { x: STATION - TOTE_PITCH / 2, y: 52, w: TOTE_PITCH * BATCHES, d: 12, r: 1 };
  out.push(S(slabOf(strip, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  const ticks = topTicks(strip.x + 0.01, strip.x + strip.w, TOTE_PITCH / 4, 4, strip.y, 0.6, [3, 7], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  for (let s = 0; s < BATCHES; s++) {
    const x = STATION + TOTE_PITCH * s;
    out.push(dotsSvg([iso([x, strip.y + 9, 0.6], P)], { size: 0.8, tone: s === 0 ? "hi" : "lo" }));
  }
  out.push(dotsSvg(FLOOR_RING.map(([x, y]) => iso([x + (x < 0 && x > -470 ? -8 : x < 0 ? 8 : -8), y + (y < 0 ? 8 : -8), 0], P)), { size: 0.6 }));
  return { box: [-480, -680, -14, LINE_END + 20, 120, 0], svg: out.join(""), bias: -1e6 };
}

function rackItems(lane, P) {
  const items = [];
  const yFar = HEAD - PITCH * lane.slots - 8;
  const len = HEAD - yFar;
  for (const side of [-1, 1]) {
    const x = lane.x + side * 52;
    const out = [];
    const posts = [];
    for (let y = HEAD - 4; y >= yFar + 3; y -= 200) posts.push(y);
    if (posts[posts.length - 1] - (yFar + 4) > 40) posts.push(yFar + 4);
    // bracing between neighbouring posts, on the outer face plane
    const brace = [];
    for (let i = 0; i + 1 < posts.length; i++) brace.push(segment([x + side * 3, posts[i] - 3, 12], [x + side * 3, posts[i + 1] + 3, BED - 16], P));
    const sorted = [...posts].sort((a, b) => depthOf([x, a, 0], P) - depthOf([x, b, 0], P));
    const draw = [];
    for (const y of sorted) {
      draw.push(S(slabOf({ x: x - 8, y: y - 8, w: 16, d: 16, r: 1 }, 0, 1.6, P, 2), { tone: "lo" }));
      draw.push(dotsSvg(corners({ x: x - 8, y: y - 8, w: 16, d: 16 }, 2.5).map(([px, py]) => iso([px, py, 1.6], P)), { size: 0.45 }));
      draw.push(S(slabOf({ x: x - 3, y: y - 3, w: 6, d: 6, r: 0.6 }, 1.6, BED - 12 - 1.6, P, 2, 0.3), { tone: "mid" }));
    }
    out.push(L(brace.join(""), { tone: "lo" }));
    out.push(draw.join(""));
    // beam with a lip that keeps the pallets in the lane
    const beam = { x: x - 3, y: yFar, w: 6, d: len, r: 0.6 };
    out.push(S(slabOf(beam, BED - 12, 12, P, 2, 0.4), { tone: "mid", inner: L(sideSeam(beam, BED - 6, P, 2), { tone: "faint" }) }));
    const lip = { x: side < 0 ? x - 3 : x + 1, y: yFar, w: 2, d: len, r: 0.3 };
    out.push(S(slabOf(lip, BED, 8, P, 2), { tone: "mid" }));
    const bolts = [];
    for (let y = HEAD - 20; y > yFar + 10; y -= 50) bolts.push(iso([x, y, BED], P));
    out.push(dotsSvg(bolts, { size: 0.45 }));
    items.push({ box: [x - 8, yFar, 0, x + 8, HEAD, BED + 8], svg: out.join("") });
  }
  // roller bed between the beams
  const rollers = [];
  for (let y = HEAD - 6; y > yFar + 4; y -= 11) rollers.push(lineOnTop([lane.x - 49, y], [lane.x + 49, y], BED - 1, P));
  const bed = { x: lane.x - 49, y: yFar, w: 98, d: len, r: 0 };
  items.push({
    box: [lane.x - 49, yFar, BED - 4, lane.x + 49, HEAD, BED - 1],
    svg: S(slabOf(bed, BED - 4, 0.4, P, 2), { tone: "faint", crease: "none" }) + L(rollers.join(""), { tone: "lo" }),
  });
  // head stop with the lane's engraved type plate
  const stop = { x: lane.x - 50, y: HEAD, w: 100, d: 6, r: 1 };
  const type = TYPES.find((t) => t.key === lane.type);
  const n = bestFace(P, [[0, 1], [0, -1]]);
  const plateC = [lane.x, n[1] > 0 ? HEAD + 6 : HEAD, BED + 9];
  const plate = faceQuad(plateC, n, 30, 9, P, 0.3);
  items.push({
    box: [stop.x, HEAD, 0, stop.x + stop.w, HEAD + 6, BED + 16],
    svg:
      S(slabOf(stop, BED - 12, 28, P, 3, 0.5), { tone: "mid" }) +
      poly(plate, "plate") + L(pathOf(plate, true), { tone: "lo" }) +
      faceText(plateC.map((v, i) => (i === 2 ? v - 2.4 : v)), n, type.code, 6.4, P, "hi") +
      dotsSvg([iso([stop.x + 6, HEAD + 3, BED + 16], P), iso([stop.x + stop.w - 6, HEAD + 3, BED + 16], P)], { size: 0.5 }),
  });
  return items;
}

function binItem(id, cx, cy, lift, opacity, kg, view, P) {
  const plan = { x: cx - BIN / 2, y: cy - BIN / 2, w: BIN, d: BIN, r: 2.5 };
  const z0 = BED + lift;
  const out = [];
  // pallet: three runners and a deck
  const runners = [-34, 0, 34].map((dx) => ({ x: plan.x + 2, y: cy + dx - 6, w: BIN - 4, d: 12, r: 0.6 }));
  runners.sort((a, b) => depthOf([cx, a.y, 0], P) - depthOf([cx, b.y, 0], P));
  for (const r of runners) out.push(S(slabOf(r, z0, 8, P, 2), { tone: "lo" }));
  out.push(S(slabOf(insetPlan(plan, -1), z0 + 8, 4, P, 2, 0.3), { tone: "mid", crease: "lo" }));
  const top = BIN_Z + lift + BIN_H;
  const box = slabOf(plan, BIN_Z + lift, BIN_H, P, 3, 0.6);
  const ribs = [];
  for (const n of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (facing(n, P) <= 0.02) continue;
    for (const s of [-30, -10, 10, 30]) {
      const t = [n[1], -n[0]];
      const fx = cx + n[0] * BIN / 2 + t[0] * s, fy = cy + n[1] * BIN / 2 + t[1] * s;
      ribs.push(segment([fx, fy, BIN_Z + lift], [fx, fy, top], P));
    }
  }
  const seam = sideSeam(plan, BIN_Z + lift + 8, P, 3) + sideSeam(plan, top - 6, P, 3);
  out.push(S(box, { tone: view.lit ? "hi" : "mid", crease: "lo", lit: view.lit, inner: L(ribs.join(""), { tone: "faint" }) + L(seam, { tone: "lo" }) }));
  const level = BIN_Z + lift + 4 + (kg / UNIT_KG) * (BIN_H - 10);
  out.push(opening(`o-${id}`, plan, top, level, kg > 0.5 ? colourOf(id) : null, P, { floor: BIN_Z + lift + 4 }));
  // label plate on the face toward the viewer
  const n = bestFace(P, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
  const c = [cx + n[0] * BIN / 2, cy + n[1] * BIN / 2, BIN_Z + lift + 36];
  const plate = faceQuad(c, n, 34, 16, P, 0.3);
  out.push(poly(plate, view.bad ? "plate bad" : "plate"), L(pathOf(plate, true), { tone: view.bad ? "red" : "lo" }));
  out.push(faceText(add(c, [0, 0, -3.6]), n, id, 10, P, view.lit ? "hi" : "mid"));
  if (view.bad) {
    // a red quarantine tag hanging from the rim
    const tc = [cx + n[0] * BIN / 2, cy + n[1] * BIN / 2, top - 12];
    const t = [n[1], -n[0], 0];
    const at = add(tc, scaleV(t, BIN / 2 - 14));
    const tag = faceQuad(at, n, 10, 14, P, 0.6);
    out.push(L(segment(add(at, [0, 0, 7]), [at[0], at[1], top], P), { tone: "red" }));
    out.push(poly(tag, "tag"));
  }
  const svg = `<g data-id="${id}" class="pick"${opacity < 1 ? ` opacity="${opacity.toFixed(3)}"` : ""}>${out.join("")}</g>`;
  return { box: [plan.x - 1, plan.y - 1, z0, plan.x + plan.w + 1, plan.y + plan.d + 1, top], svg };
}

function beltItems(P, g) {
  const items = [];
  const { x0, x1, half, top } = BELT;
  const legs = [];
  for (let x = x0 + 20; x < x1; x += 120) legs.push(x);
  legs.push(x1 - 14);
  for (const side of [-1, 1]) {
    const y = side * (half + 2);
    const out = [];
    const sorted = [...legs].sort((a, b) => depthOf([a, y, 0], P) - depthOf([b, y, 0], P));
    for (const x of sorted) {
      out.push(S(slabOf({ x: x - 7, y: y - 7, w: 14, d: 14, r: 1 }, 0, 1.6, P, 2), { tone: "lo" }));
      out.push(S(slabOf({ x: x - 2.5, y: y - 2.5, w: 5, d: 5, r: 0.5 }, 1.6, top - 14 - 1.6, P, 2, 0.3), { tone: "mid" }));
    }
    const channel = { x: x0, y: y - 2, w: x1 - x0, d: 4, r: 0.5 };
    out.push(S(slabOf(channel, top - 14, 18, P, 2, 0.3), { tone: "mid", inner: L(sideSeam(channel, top - 8, P, 2), { tone: "faint" }) }));
    const bolts = [];
    for (let x = x0 + 12; x < x1; x += 40) bolts.push(iso([x, y, top + 4], P));
    out.push(dotsSvg(bolts, { size: 0.45 }));
    items.push({ box: [x0, y - 7, 0, x1, y + 7, top + 4], svg: out.join("") });
  }
  // belt surface with cleats that run with the material
  const belt = { x: x0 + 2, y: -half, w: x1 - x0 - 4, d: half * 2, r: 0 };
  const cleats = [];
  const phase = ((g * 190) % 30 + 30) % 30;
  for (let x = x0 + 6 + phase; x < x1 - 4; x += 30) cleats.push(lineOnTop([x, -half + 1], [x, half - 1], top, P));
  items.push({ box: [x0 + 2, -half, top - 6, x1 - 2, half, top], svg: S(slabOf(belt, top - 6, 6, P, 2), { tone: "mid", crease: "lo" }) + L(cleats.join(""), { tone: "lo" }) });
  // drive: a geared motor standing at the tail
  const mx = x0 + 18, my = half + 22;
  items.push({
    box: [mx - 14, my - 14, 0, mx + 14, my + 14, top - 6],
    svg:
      S(slabOf({ x: mx - 14, y: my - 14, w: 28, d: 28, r: 2 }, 0, 4, P, 3), { tone: "lo" }) +
      S(slabOf({ x: mx - 10, y: my - 10, w: 20, d: 20, r: 2 }, 4, 30, P, 3, 0.4), { tone: "mid" }) +
      S(cylinder(mx, my, 9, 34, 44, P, 28, 0.5), { tone: "mid", inner: L(knurl(mx, my, 9, 34, 78, 30, P, 0), { tone: "faint" }) }) +
      S(cylinder(mx, my, 6, 78, 8, P, 24), { tone: "mid" }) +
      dotsSvg(corners({ x: mx - 14, y: my - 14, w: 28, d: 28 }, 3).map(([x, y]) => iso([x, y, 4], P)), { size: 0.5 }),
  });
  return items;
}

function mixerItems(P, g, level, mixFill) {
  const items = [];
  const plan = { x: MIX.x, y: MIX.y, w: MIX.w, d: MIX.d, r: MIX.r };
  // legs and feet
  const legPts = corners(plan, 12).sort((a, b) => depthOf([...a, 0], P) - depthOf([...b, 0], P));
  const legs = legPts.map(([x, y]) =>
    S(slabOf({ x: x - 9, y: y - 9, w: 18, d: 18, r: 1 }, 0, 2, P, 2), { tone: "lo" }) +
    S(slabOf({ x: x - 4, y: y - 4, w: 8, d: 8, r: 0.8 }, 2, MIX.z0 - 2, P, 2, 0.3), { tone: "mid" }),
  );
  const body = slabOf(plan, MIX.z0, MIX.top - MIX.z0, P, 6, 1);
  const seams = sideSeam(plan, MIX.z0 + 10, P, 6) + sideSeam(plan, MIX.top - 8, P, 6);
  const out = [legs.join(""), S(body, { tone: "mid", crease: "lo", inner: L(seams, { tone: "lo" }) })];
  out.push(opening("o-mix", plan, MIX.top, MIX.z0 + 6 + level * (MIX.top - MIX.z0 - 18), level > 0.0005 ? mixFill : null, P, { floor: MIX.z0 + 6 }));
  // twin paddle shafts across the trough, turning while mixing
  const shaftZ = MIX.top;
  const blades = [];
  for (const y of [-20, 20]) {
    blades.push(lineOnTop([plan.x + 3.2, y], [plan.x + plan.w - 3.2, y], MIX.top, P));
    for (let i = 0; i < 6; i++) {
      const x = plan.x + 18 + i * 21;
      const a = g * 9 * (y > 0 ? 1 : -1) + i * 1.05;
      blades.push(segment([x, y, shaftZ], [x + Math.cos(a) * 4, y + Math.sin(a) * 14, shaftZ - Math.abs(Math.sin(a)) * 6], P));
    }
  }
  out.push(L(blades.join(""), { tone: "mid", free: "end" }));
  out.push(dotsSvg(corners(plan, 5).map(([x, y]) => iso([x, y, MIX.top], P)), { size: 0.55 }));
  items.push({ box: [plan.x, plan.y, 0, plan.x + plan.w, plan.y + plan.d, MIX.top], svg: out.join("") });
  // gearbox and motor on the back of the trough
  const gb = { x: -36, y: MIX.y - 26, w: 46, d: 26, r: 2 };
  items.push({
    box: [gb.x, gb.y, 0, gb.x + gb.w + 36, gb.y + gb.d, MIX.top - 6],
    svg:
      S(slabOf({ x: gb.x + 6, y: gb.y + 4, w: 10, d: 18, r: 1 }, 0, 52, P, 2), { tone: "lo" }) +
      S(slabOf(gb, 52, 34, P, 3, 0.6), { tone: "mid", inner: L(sideSeam(gb, 70, P, 3), { tone: "faint" }) }) +
      S(slabOf({ x: gb.x + gb.w, y: gb.y + 3, w: 36, d: 20, r: 3 }, 56, 24, P, 4, 0.5), { tone: "mid" }) +
      dotsSvg(corners(gb, 4).map(([x, y]) => iso([x, y, 86], P)), { size: 0.5 }),
  });
  return items;
}

function spoutItem(P, flowing) {
  const s = { x: SPOUT.x0, y: -12, w: SPOUT.x1 - SPOUT.x0, d: 24, r: 2 };
  const nozzle = { x: STATION - 14, y: -14, w: 28, d: 28, r: 3 };
  const out = [];
  out.push(S(slabOf(s, SPOUT.low, SPOUT.top - SPOUT.low, P, 3, 0.5), { tone: "mid", inner: L(sideSeam(s, SPOUT.top - 4, P, 3), { tone: "faint" }) }));
  out.push(S(slabOf(nozzle, SPOUT.low - 6, 6, P, 4, 0.4), { tone: flowing ? "hi" : "mid", lit: flowing }));
  out.push(dotsSvg([[SPOUT.x0 + 8, -8], [SPOUT.x0 + 8, 8], [SPOUT.x1 - 30, -8], [SPOUT.x1 - 30, 8]].map(([x, y]) => iso([x, y, SPOUT.top], P)), { size: 0.5 }));
  return { box: [SPOUT.x0, -14, SPOUT.low - 6, SPOUT.x1, 14, SPOUT.top], svg: out.join("") };
}

function conveyorItems(P) {
  const items = [];
  const x0 = STATION - TOTE_PITCH / 2 - 10, x1 = LINE_END;
  for (const side of [-1, 1]) {
    const y = side * 44;
    const rail = { x: x0, y: y - 2.5, w: x1 - x0, d: 5, r: 0.5 };
    const feet = [];
    for (let x = x0 + 14; x < x1; x += 140) feet.push(S(slabOf({ x: x - 6, y: y - 6, w: 12, d: 12, r: 1 }, 0, 4, P, 2), { tone: "lo" }));
    items.push({ box: [x0, y - 6, 0, x1, y + 6, TOTE_Z], svg: feet.join("") + S(slabOf(rail, 4, TOTE_Z - 4, P, 2, 0.3), { tone: "mid" }) });
  }
  const rollers = [];
  for (let x = x0 + 5; x < x1 - 2; x += 9) rollers.push(lineOnTop([x, -41.5], [x, 41.5], TOTE_Z - 3, P));
  items.push({ box: [x0, -41.5, TOTE_Z - 5, x1, 41.5, TOTE_Z - 3], svg: S(slabOf({ x: x0, y: -41.5, w: x1 - x0, d: 83, r: 0 }, TOTE_Z - 5, 0.4, P, 2), { tone: "faint", crease: "none" }) + L(rollers.join(""), { tone: "lo" }) });
  items.push({ box: [x1, -46, 0, x1 + 6, 46, TOTE_Z + 14], svg: S(slabOf({ x: x1, y: -46, w: 6, d: 92, r: 1 }, 0, TOTE_Z + 14, P, 3, 0.4), { tone: "mid" }) });
  return items;
}

// A batch tote with its batch ticket: one band per source, in proportion to mass.
function toteItem(n, x, fill, opacity, view, P) {
  const plan = { x: x - TOTE / 2, y: -TOTE / 2, w: TOTE, d: TOTE, r: 4 };
  const top = TOTE_Z + TOTE_H;
  const out = [];
  out.push(S(slabOf(insetPlan(plan, 4), TOTE_Z, 3, P, 3), { tone: "lo" }));
  const ribs = [];
  for (const n2 of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (facing(n2, P) <= 0.02) continue;
    for (const s of [-24, 24]) {
      const t = [n2[1], -n2[0]];
      const fx = x + n2[0] * TOTE / 2 + t[0] * s, fy = n2[1] * TOTE / 2 + t[1] * s;
      ribs.push(segment([fx, fy, TOTE_Z + 3], [fx, fy, top], P));
    }
  }
  const tone = view.bad ? "red" : view.lit ? "hi" : "mid";
  out.push(S(slabOf(plan, TOTE_Z + 3, TOTE_H - 3, P, 4, 0.6), { tone, crease: "lo", lit: view.lit, inner: L(ribs.join(""), { tone: "faint" }) + L(sideSeam(plan, top - 5, P, 4), { tone: "lo" }) }));
  out.push(opening(`o-t${n}`, plan, top, TOTE_Z + 6 + fill * (TOTE_H - 12), fill > 0.002 ? "var(--mince)" : null, P, { floor: TOTE_Z + 6 }));
  // batch ticket
  const face = bestFace(P, [[0, 1], [0, -1], [1, 0], [-1, 0]]);
  const c = [x + face[0] * TOTE / 2, face[1] * TOTE / 2, TOTE_Z + TOTE_H / 2 + 2];
  const tw = 30, th = 38;
  const card = faceQuad(c, face, tw, th, P, 0.3);
  out.push(poly(card, "plate"), L(pathOf(card, true), { tone: view.bad ? "red" : "lo" }));
  out.push(faceText(add(c, [0, 0, th / 2 - 8]), face, String(n + 1), 8, P, "hi"));
  // bands: units top-down, the carry-over (drawn ×20 so it can be seen) at the bottom
  const parts = recipeOf(n);
  const order = ["G", "M", "C", "c"];
  parts.sort((a, b) => order.indexOf(a.id[0]) - order.indexOf(b.id[0]) || a.id.localeCompare(b.id));
  const barH = th - 14;
  const barTop = c[2] + th / 2 - 11;
  const weights = parts.map((p) => (p.id === "carry" ? 0.02 : p.kg / 1000));
  const sum = weights.reduce((a, b) => a + b, 0);
  let z = barTop;
  const shown = barH * Math.min(1, fill / 0.98);
  const bandsSvg = [];
  parts.forEach((p, i) => {
    const h = (weights[i] / sum) * barH;
    const visible = Math.max(0, Math.min(h, shown - (barTop - z)));
    if (visible > 0.05) {
      const q = faceQuad([c[0], c[1], z - visible / 2], face, tw - 8, visible, P, 0.5);
      bandsSvg.push(`<path class="band" data-src="${p.id}" d="${pathOf(q, true)}" style="fill:${colourOf(p.id)}"/>`);
    }
    z -= h;
  });
  const frame = faceQuad([c[0], c[1], barTop - barH / 2], face, tw - 8, barH, P, 0.5);
  out.push(bandsSvg.join(""), L(pathOf(frame, true), { tone: "lo" }));
  if (view.trace) out.push(dotsSvg([iso(add(c, [0, 0, th / 2 + 4]), P)], { size: view.bad ? 1.6 : 0.9, tone: "hi" }).replace("iso-dots", "iso-dots bad-dot"));
  const svg = `<g data-id="b${n}" class="pick"${opacity < 1 ? ` opacity="${opacity.toFixed(3)}"` : ""}>${out.join("")}</g>`;
  return { box: [plan.x, plan.y, TOTE_Z, plan.x + TOTE, plan.y + TOTE, top], svg };
}

function panelItem(P, g) {
  // control pedestal with the batch counter: a dial with one division per batch
  const px = 30, py = -122;
  const out = [];
  out.push(S(slabOf({ x: px - 12, y: py - 12, w: 24, d: 24, r: 1.5 }, 0, 3, P, 2), { tone: "lo" }));
  out.push(S(slabOf({ x: px - 4, y: py - 4, w: 8, d: 8, r: 1 }, 3, 80, P, 2, 0.3), { tone: "mid" }));
  const box = { x: px - 26, y: py - 18, w: 52, d: 36, r: 3 };
  out.push(S(slabOf(box, 83, 14, P, 4, 0.8), { tone: "mid", crease: "lo" }));
  const dial = [px - 6, py];
  out.push(S(cylinder(dial[0], dial[1], 13, 97, 3, P, 40, 0.5), { tone: "hi", crease: "lo" }));
  const ticks = radialTicks(dial[0], dial[1], 12, BATCHES * 2, 2, 100, [1.4, 3], P, -Math.PI * 0.75, Math.PI * 1.5);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  const a = -Math.PI * 0.75 + (Math.min(g, BATCHES) / BATCHES) * Math.PI * 1.5;
  out.push(L(lineOnTop([dial[0] - Math.sin(a) * 2, dial[1] + Math.cos(a) * 2], [dial[0] + Math.sin(a) * 9.5, dial[1] - Math.cos(a) * 9.5], 100.2, P), { tone: "lit", free: "start" }));
  out.push(dotsSvg([iso([dial[0], dial[1], 100.2], P)], { size: 0.9, tone: "hi" }));
  for (const [bx, k] of [[px + 12, 0], [px + 20, 1]]) {
    out.push(S(cylinder(bx, py - 6 + k * 12, 3.4, 97, 2.5, P, 20), { tone: "mid" }));
  }
  out.push(dotsSvg(corners(box, 3).map(([x, y]) => iso([x, y, 97], P)), { size: 0.45 }));
  return { box: [box.x, box.y, 0, box.x + box.w, box.y + box.d, 100], svg: out.join("") };
}

// ---- the frame -----------------------------------------------------------------------------
// state: { g (figure time in batches), azimuth, elevation, contaminated:Set, focus:id|null }
export function sceneSvg(state) {
  const { g, azimuth, elevation, contaminated, focus, levels } = state;
  const P = projectionOf(azimuth, elevation);
  const items = [floorItem(P)];
  const t = drawnAt(g);
  const remaining = remainingAt(t);
  const focusBatches = focus && focus[0] === "b" ? new Set(Object.keys(ALLOC[Number(focus.slice(1))])) : null;
  const unitFed = focus && focus[0] !== "b" ? new Set(ALLOC.map((parts, n) => (parts[focus] ? n : -1)).filter((n) => n >= 0)) : null;
  const carryFrom = focus && focus[0] === "b" ? Number(focus.slice(1)) - 1 : null;

  // racks and their units
  for (const lane of LANES) {
    items.push(...rackItems(lane, P));
    const ids = Array.from({ length: lane.slots }, (_, i) => `${lane.type}${i + 1}`);
    const gone = ids.map((id) => {
      const e = emptyAt(id);
      return e <= BATCHES + 1e-9 ? figureAt(e) : Infinity;
    });
    ids.forEach((id, i) => {
      let slot = i;
      for (let j = 0; j < i; j++) slot -= smooth((g - gone[j] - 0.06) / 0.14);
      const fade = smooth((g - gone[i]) / 0.08);
      if (fade >= 1) return;
      const cy = HEAD - 4 - BIN / 2 - slot * PITCH;
      const view = {
        lit: focus === id || (focusBatches?.has(id) ?? false),
        bad: contaminated.has(id),
      };
      items.push(binItem(id, lane.x, cy, fade * 40, 1 - fade, remaining[id] ?? UNIT_KG, view, P));
    });
  }

  // material on its way: chunks leave the open unit of each type, ride the belt, drop in
  const n = Math.min(BATCHES - 1, Math.floor(g));
  const u = g - n;
  const chunks = [];
  if (g < BATCHES) {
    const SPEED = 1.9; // belt length per batch time unit, in units of 1000 world units
    for (const lane of LANES) {
      const per = lane.type === "G" ? 0.022 : lane.type === "M" ? 0.04 : 0.11;
      for (let s = 0; s < PHASE.transfer; s += per) {
        const age = u - s;
        const hop = 0.035;
        const ride = (lane.x - BELT.x1 > 0 ? 0 : BELT.x1 - lane.x) / (SPEED * 1000);
        if (age < 0 || age > hop + ride + 0.03) continue;
        const id = activeAt(lane.type, n + s / PHASE.transfer);
        if (!id) continue;
        let p;
        const spread = ((s * 997) % 1 - 0.5) * 24;
        if (age < hop) {
          const k = age / hop;
          p = [lane.x, -94 + (94 + spread) * k, BIN_Z + BIN_H - 6 - (BIN_Z + BIN_H - 6 - BELT.top - 3) * k * k + 18 * Math.sin(Math.PI * k)];
        } else if (age < hop + ride) {
          p = [lane.x + (age - hop) * SPEED * 1000, spread, BELT.top + 3];
        } else {
          const k = (age - hop - ride) / 0.03;
          p = [BELT.x1 + 18 * k, spread, BELT.top + 3 - 30 * k * k];
        }
        chunks.push({ id, p });
      }
    }
  }
  for (const { id, p } of chunks) {
    const r = id[0] === "C" ? 5 : 4.2;
    const plan = { x: p[0] - r, y: p[1] - r, w: r * 2, d: r * 2, r: id[0] === "C" ? 0.5 : 2 };
    const paths = slabOf(plan, p[2] - 3, 4.5, P, 2);
    items.push({ box: [plan.x, plan.y, p[2] - 3, plan.x + plan.w, plan.y + plan.d, p[2] + 1.5], svg: `<g class="chunk" style="--u:${colourOf(id)}">${S(paths, { tone: "lo", crease: "none" })}</g>` });
  }

  items.push(...beltItems(P, g));

  // mixer contents: rises during transfer, holds while mixing, leaves the carry-over behind
  let level;
  const residue = 0.002;
  if (g >= BATCHES) level = residue;
  else if (u < PHASE.transfer) level = residue + (u / PHASE.transfer) * 0.98;
  else if (u < PHASE.mix) level = 0.98 + residue;
  else if (u < PHASE.discharge) level = residue + 0.98 * (1 - (u - PHASE.mix) / (PHASE.discharge - PHASE.mix));
  else level = residue;
  if (g < 0.0001) level = 0;
  items.push(...mixerItems(P, u < PHASE.mix && u > PHASE.transfer ? g : n * 3, level, "var(--mince)"));
  const flowing = g < BATCHES && u >= PHASE.mix && u < PHASE.discharge;
  items.push(spoutItem(P, flowing));
  if (flowing) {
    // a falling rope of mince from nozzle into the tote
    const rope = { x: STATION - 5, y: -5, w: 10, d: 10, r: 4 };
    items.push({ box: [rope.x, rope.y, TOTE_Z + 20, rope.x + 10, rope.y + 10, SPOUT.low - 6], svg: `<g class="chunk" style="--u:var(--mince)">${S(cylinder(STATION, 0, 4.5, TOTE_Z + 20, SPOUT.low - 6 - TOTE_Z - 20, P, 16), { tone: "lo", crease: "none" })}</g>`, bias: 5 });
  }
  items.push(panelItem(P, g));
  items.push(...conveyorItems(P));

  // totes: one per started batch; each finished batch is pushed one pitch along
  for (let b = 0; b < BATCHES; b++) {
    if (g < b - 0.02) continue;
    let slot = 0;
    for (let m = b + 1; m <= BATCHES; m++) slot += smooth((g - (m - 0.11)) / 0.1);
    const fill = g >= b + 1 ? 1 : clamp((g - b - PHASE.mix) / (PHASE.discharge - PHASE.mix), 0, 1);
    const view = {
      lit: focus === `b${b}` || (unitFed?.has(b) && g >= b + PHASE.mix) || carryFrom === b,
      bad: (levels?.[b] ?? 0) >= 1e-3 && g >= b + PHASE.mix,
      trace: (levels?.[b] ?? 0) > 0 && g >= b + PHASE.mix,
    };
    const appear = smooth((g - b + 0.02) / 0.06);
    items.push(toteItem(b, STATION + slot * TOTE_PITCH, fill, appear, view, P));
  }

  const body = sortItems(items, P).map((item) => item.svg).join("");
  return { body, P };
}

export const SCENE_SOURCE_NOTE = "shared by build.mjs and the page";
