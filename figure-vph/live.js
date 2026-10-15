// Browser runtime: kit globals (iso, slabOf, …) and model.mjs are inlined before this file.
const W = 960, H = 640;
const FLOOR = { x: -150, y: -150, w: 300, d: 290, r: 6 };
const SCALE = { x: -88, y: -78, w: 176, d: 156, r: 3 };
const BOX = { x: -60, y: -50, w: 120, d: 100, r: 3 };
const BOX_Z = 24, BOX_TOP = 104, WALL = 4, IN_FLOOR = 28, FILL_H = 72;
const BOARD = { x: -130, y: -132, w: 260, d: 6, r: 1.5 };
const BOARD_Z = 128, BOARD_TOP = 284, FACE_Y = BOARD.y + BOARD.d;
const IND = [116, 66];
const COLS = 10, CELL_W = 24, ROW_H = 24, ICON = 0.8;
const DEPART = 0.6, FLIGHT = 0.4; // animal-time units
const END = 60.05;
const EXTENT = [...boxCorners(FLOOR, -10, 0), ...boxCorners(BOARD, BOARD_Z, BOARD_TOP), [IND[0], IND[1], 116]];
const INNER = insetPlan(BOX, WALL);

const $ = (s) => document.querySelector(s);
const stage = $(".vp-stage");
const backSvg = stage.querySelector("svg.vp-back");
const frontSvg = stage.querySelector("svg.vp-front");
const canvas = stage.querySelector("canvas");
const ctx = canvas.getContext("2d");
const cache = document.createElement("canvas");
const cctx = cache.getContext("2d");
const readout = document.querySelector("[data-readout]");
const still = matchMedia("(prefers-reduced-motion: reduce)");

// ---------------------------------------------------------------- state
const RUN_SEED = 1234567;
const NOTRM = referenceCount(rngOf(RUN_SEED)); // drawn once per run, as in R
const state = {
  az: 56, el: 34, view: { az: 56, el: 34 },
  T: 0, playing: !still.matches, speed: 1.2,
  mode: "physical", sel: null, piece: null,
  box: null, archive: [], loadsVersion: 0,
};
function defaultsFor(index) {
  if (index === 0) return [[12, 500], [41, 5000]];
  const r = rngOf(RUN_SEED + 7919 * index);
  const a = Math.floor(r() * 60), b = (a + 1 + Math.floor(r() * 59)) % 60;
  const load = () => Number((10 ** (1.5 + r() * 2.8)).toPrecision(2));
  return [[index * 60 + a + 1, load()], [index * 60 + b + 1, load()]];
}
function newBox(index) {
  const box = makeBox(index, NOTRM, RUN_SEED + 104729 * (index + 1), defaultsFor(index));
  let cum = 0;
  box.pieces.forEach((p) => {
    const a = box.animals[p.slot];
    p.t0 = p.slot + (DEPART * (p.n + 0.5)) / a.pieces.length;
    p.t1 = p.t0 + FLIGHT;
    // footprint: irregular polygon whose area is mass × AREA_PER_G
    const k = 9, pts = [];
    for (let i = 0; i < k; i++) {
      const ang = ((i + 0.35 * (p.shape[i] - 0.5)) / k) * Math.PI * 2;
      const rad = 0.72 + 0.56 * p.shape[(i * 4 + 3) % k];
      pts.push([Math.cos(ang) * rad, Math.sin(ang) * rad * (0.7 + 0.3 * p.shape[0])]);
    }
    let A = 0;
    for (let i = 0; i < k; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % k]; A += x1 * y2 - x2 * y1; }
    const s = Math.sqrt((p.mass * AREA_PER_G) / Math.abs(A / 2));
    p.local = pts.map(([x, y]) => [x * s, y * s]);
    const R = 1.25 * s;
    p.pos = [INNER.x + R + p.land[0] * (INNER.w - 2 * R), INNER.y + R + p.land[1] * (INNER.d - 2 * R), IN_FLOOR + (cum / BOX_G) * FILL_H + p.land[2] * 1.4];
    p.yaw = p.spin * Math.PI * 2;
    p.tone = p.shape[1];
    cum += p.mass;
  });
  return box;
}
state.box = newBox(0);

const slotXZ = (slot) => [-108 + (slot % COLS) * CELL_W, BOARD_TOP - 8 - Math.floor(slot / COLS) * ROW_H];
const P = () => fitProjection(EXTENT, W, H, { pad: 14, azimuth: state.az, elevation: state.el });

// ---------------------------------------------------------------- static layers
const S = (paths, style) => solidSvg(paths, style);
const L = (d, style) => lineSvg(d, style);
const poly = (pts, cls, extra = "") => `<path class="${cls}" d="${pathOf(pts, true)}"${extra}/>`;
const facing = (n, P) => { const [vx, vy] = towardViewer(P); return n[0] * vx + n[1] * vy; };
function faceText(c, n, text, size, P, tone = "mid", anchor = "middle") {
  const t = [n[1], -n[0], 0];
  const o = [c[0] + n[0] * 0.4, c[1] + n[1] * 0.4, c[2]];
  const p0 = iso(o, P), pu = iso([o[0] + t[0], o[1] + t[1], o[2]], P), pv = iso([o[0], o[1], o[2] - 1], P);
  const m = [pu[0] - p0[0], pu[1] - p0[1], pv[0] - p0[0], pv[1] - p0[1], p0[0], p0[1]].map((v) => Math.round(v * 1000) / 1000);
  return faceTextSvg(`matrix(${m.join(" ")})`, text, { size, tone, anchor });
}
const CARCASS = [[-1.2, 0], [1.2, 0], [2.1, 3], [4.8, 6], [5.3, 9.2], [4.5, 12], [5.5, 15.2], [4.4, 18], [1.6, 20.2], [-1.4, 19.8], [-3.7, 17.2], [-4.5, 13.2], [-3.8, 9.6], [-4.5, 6.1], [-2.6, 3]];

function buildBack(P) {
  const out = [];
  out.push(`<path class="iso-halo" d="${haloOf(FLOOR, -10, 10, P)}"/>`);
  out.push(S(slabOf(FLOOR, -10, 10, P, 6, 1.2), { tone: "mid", crease: "lo" }));
  out.push(L(planOutline(insetPlan(FLOOR, 6), 0, P), { tone: "faint" }));
  out.push(dotsSvg(corners(FLOOR, 14).map(([x, y]) => iso([x, y, 0], P)), { size: 0.55 }));
  // board on two legs
  const legs = [-126, 118].map((x) => ({ x, y: BOARD.y - 0.5, w: 8, d: 8, r: 1 }));
  for (const leg of legs) {
    out.push(S(slabOf({ x: leg.x - 5, y: leg.y - 5, w: 18, d: 18, r: 1.5 }, 0, 2, P, 2), { tone: "lo" }));
    out.push(S(slabOf(leg, 2, BOARD_Z - 2, P, 2, 0.4), { tone: "mid" }));
  }
  out.push(S(slabOf(BOARD, BOARD_Z, BOARD_TOP - BOARD_Z, P, 3, 1), { tone: "mid", crease: "lo" }));
  const rails = [];
  for (let row = 0; row < 6; row++) {
    const z = BOARD_TOP - 6 - row * ROW_H;
    rails.push(segment([BOARD.x, FACE_Y, z], [BOARD.x + BOARD.w, FACE_Y, z], P));
  }
  out.push(L(rails.join(""), { tone: "lo" }));
  out.push(dotsSvg([BOARD.x + 6, BOARD.x + BOARD.w - 6].flatMap((x) => [iso([x, FACE_Y, BOARD_TOP - 5], P), iso([x, FACE_Y, BOARD_Z + 5], P)]), { size: 0.55 }));
  // 60 carcass sides, hung by the hind shank, numbered
  const n = [0, 1];
  for (const a of state.box.animals) {
    const [cx, zTop] = slotXZ(a.slot);
    const pts = CARCASS.map(([u, v]) => iso([cx + u * ICON, FACE_Y + 0.3, zTop - 2 - v * ICON], P));
    out.push(`<g class="carc" data-animal="${a.id}">${poly(pts, "carc-body")}${dotsSvg([iso([cx, FACE_Y + 0.3, zTop + 2], P)], { size: 0.8, tone: "mid" })}${L(segment([cx, FACE_Y + 0.3, zTop + 2], [cx, FACE_Y + 0.3, zTop - 2], P), { tone: "mid" })}${faceText([cx, FACE_Y + 0.3, zTop - 20.6], n, String(a.id), 4.4, P, "mid")}</g>`);
  }
  // platform scale
  for (const [x, y] of corners(SCALE, 12).sort((a, b) => depthOf([...a, 0], P) - depthOf([...b, 0], P))) out.push(S(cylinder(x, y, 6, 0, 3, P, 18), { tone: "lo" }));
  out.push(S(slabOf(SCALE, 3, 7, P, 4, 0.8), { tone: "mid", crease: "lo" }));
  out.push(dotsSvg(dotGrid(SCALE.x + 8, SCALE.y + 8, 21, 18, 8, 10, P), { size: 0.35, tone: "faint" }));
  out.push(L(planOutline(insetPlan(SCALE, 4), 10, P), { tone: "faint" }));
  // pallet
  const runners = [-38, 0, 38].map((dy) => ({ x: BOX.x + 2, y: dy - 6, w: BOX.w - 4, d: 12, r: 0.6 }));
  runners.sort((a, b) => depthOf([0, a.y, 0], P) - depthOf([0, b.y, 0], P));
  for (const r of runners) out.push(S(slabOf(r, 10, 9, P, 2), { tone: "lo" }));
  out.push(S(slabOf(insetPlan(BOX, -2), 19, 5, P, 2, 0.3), { tone: "mid", crease: "lo" }));
  // box interior: mouth, far inner walls, floor
  const rim = [[INNER.x, INNER.y], [INNER.x + INNER.w, INNER.y], [INNER.x + INNER.w, INNER.y + INNER.d], [INNER.x, INNER.y + INNER.d]];
  const mouth = rim.map(([x, y]) => iso([x, y, BOX_TOP], P));
  out.push(`<clipPath id="vp-mouth"><path d="${pathOf(mouth, true)}"/></clipPath><g clip-path="url(#vp-mouth)">`);
  out.push(poly(mouth, "in-dark"));
  const [vx, vy] = towardViewer(P);
  const walls = [{ a: rim[0], b: rim[1], n: [0, 1] }, { a: rim[1], b: rim[2], n: [-1, 0] }, { a: rim[2], b: rim[3], n: [0, -1] }, { a: rim[3], b: rim[0], n: [1, 0] }];
  for (const w of walls) {
    const f = w.n[0] * vx + w.n[1] * vy;
    if (f <= 0) continue;
    out.push(poly([iso([...w.a, BOX_TOP], P), iso([...w.b, BOX_TOP], P), iso([...w.b, IN_FLOOR], P), iso([...w.a, IN_FLOOR], P)], "in-wall", ` data-shade="${f > 0.7 ? 1 : 0}"`));
    const ribs = [];
    for (let s = 0.2; s < 0.95; s += 0.2) {
      const x = w.a[0] + (w.b[0] - w.a[0]) * s, y = w.a[1] + (w.b[1] - w.a[1]) * s;
      ribs.push(segment([x, y, IN_FLOOR], [x, y, BOX_TOP], P));
    }
    out.push(L(ribs.join(""), { tone: "faint" }));
  }
  out.push(poly(rim.map(([x, y]) => iso([x, y, IN_FLOOR], P)), "in-floor"));
  out.push("</g>");
  return out.join("");
}

function rimStrips(P) {
  const o = [[BOX.x, BOX.y], [BOX.x + BOX.w, BOX.y], [BOX.x + BOX.w, BOX.y + BOX.d], [BOX.x, BOX.y + BOX.d]];
  const i = [[INNER.x, INNER.y], [INNER.x + INNER.w, INNER.y], [INNER.x + INNER.w, INNER.y + INNER.d], [INNER.x, INNER.y + INNER.d]];
  return o.map((_, k) => poly([o[k], o[(k + 1) % 4], i[(k + 1) % 4], i[k]].map(([x, y]) => iso([x, y, BOX_TOP], P)), "iso-top", ' style="stroke:var(--anatomy-top);stroke-width:.5"')).join("");
}
function buildFront(P) {
  const out = [];
  const box = slabOf(BOX, BOX_Z, BOX_TOP - BOX_Z, P, 3, 0.6);
  const rimIn = [[INNER.x, INNER.y], [INNER.x, INNER.y + INNER.d], [INNER.x + INNER.w, INNER.y + INNER.d], [INNER.x + INNER.w, INNER.y]].map(([x, y]) => iso([x, y, BOX_TOP], P));
  const ribs = [];
  for (const n of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (facing(n, P) <= 0.02) continue;
    const half = n[0] ? BOX.d / 2 : BOX.w / 2;
    for (let s = -half + 20; s < half - 10; s += 20) {
      const t = [n[1], -n[0]];
      const fx = n[0] * (BOX.w / 2) + t[0] * s, fy = n[1] * (BOX.d / 2) + t[1] * s;
      ribs.push(segment([fx, fy, BOX_Z], [fx, fy, BOX_TOP], P));
    }
  }
  const seams = sideSeam(BOX, BOX_Z + 10, P, 3) + sideSeam(BOX, BOX_TOP - 8, P, 3);
  const shades = box.shades.map((d, i) => (d ? `<path class="iso-shade" data-shade="${i}" d="${d}"/>` : "")).join("");
  out.push(`<g class="iso-solid wall">${shades}${rimStrips(P)}${L(box.crease, { tone: "lo" })}${L(ribs.join(""), { tone: "faint" })}${L(seams, { tone: "lo" })}<path class="iso-line iso-edge" data-tone="hi" d="${box.outline}"/>${L(pathOf(rimIn, true), { tone: "lo" })}</g>`);
  // label plate on the face that faces the viewer most
  const nBest = [[1, 0], [0, 1], [-1, 0], [0, -1]].reduce((b, n) => (facing(n, P) > facing(b, P) ? n : b));
  const c = [nBest[0] * BOX.w / 2, nBest[1] * BOX.d / 2, BOX_Z + 46];
  const t = [nBest[1], -nBest[0], 0];
  const q = [[-22, 9], [22, 9], [22, -9], [-22, -9]].map(([u, v]) => iso([c[0] + t[0] * u + nBest[0] * 0.3, c[1] + t[1] * u + nBest[1] * 0.3, c[2] + v], P));
  out.push(poly(q, "plate"), L(pathOf(q, true), { tone: "lo" }), faceText([c[0], c[1], c[2] + 2.5], nBest, "VPH 1000 kg", 6.4, P, "hi"), faceText([c[0], c[1], c[2] - 4.6], nBest, `box ${state.box.index + 1}`, 4.6, P, "mid"));
  // load cable to the indicator and the indicator stand with its dial
  out.push(wireSvg(iso([SCALE.x + SCALE.w, 50, 6], P), iso([IND[0] - 4, IND[1], 3], P), { via: [iso([IND[0] - 4, 50, 0.5], P)], tone: "lo", size: 1 }));
  out.push(S(slabOf({ x: IND[0] - 12, y: IND[1] - 12, w: 24, d: 24, r: 2 }, 0, 3, P, 3), { tone: "lo" }));
  out.push(S(slabOf({ x: IND[0] - 3.5, y: IND[1] - 3.5, w: 7, d: 7, r: 1 }, 3, 92, P, 2, 0.3), { tone: "mid" }));
  const head = { x: IND[0] - 20, y: IND[1] - 15, w: 40, d: 30, r: 3 };
  out.push(S(slabOf(head, 95, 14, P, 4, 0.8), { tone: "mid", crease: "lo" }));
  out.push(S(cylinder(IND[0], IND[1], 13, 109, 2.5, P, 40, 0.5), { tone: "hi", crease: "lo" }));
  const ticks = radialTicks(IND[0], IND[1], 12, 20, 2, 111.5, [1.3, 2.8], P, -Math.PI * 0.75, Math.PI * 1.5);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  out.push(`<path class="iso-line" data-tone="lit" data-free="start" data-needle d="" style="stroke-width:1.1"/>`);
  out.push(dotsSvg([iso([IND[0], IND[1], 111.6], P)], { size: 0.9, tone: "hi" }));
  out.push(dotsSvg(corners(head, 3).map(([x, y]) => iso([x, y, 109], P)), { size: 0.45 }));
  return out.join("");
}
function needleD(P, kg) {
  const a = -Math.PI * 0.75 + Math.min(1.05, kg / 1000) * Math.PI * 1.5;
  return lineOnTop([IND[0] - Math.sin(a) * 2, IND[1] + Math.cos(a) * 2], [IND[0] + Math.sin(a) * 9.5, IND[1] - Math.cos(a) * 9.5], 111.6, P);
}

// ---------------------------------------------------------------- pieces on the canvas
let colors = {};
const hexOf = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c.trim()); const n = m ? parseInt(m[1], 16) : 0x888888; return [n >> 16, (n >> 8) & 255, n & 255]; };
const mix = (a, b, t) => { const x = hexOf(a), y = hexOf(b); return `rgb(${x.map((v, i) => Math.round(v * t + y[i] * (1 - t))).join(",")})`; };
function readColors() {
  const cs = getComputedStyle(stage);
  for (const k of ["meat", "meat-lo", "meat-hi", "mute", "mute-lo", "bad", "lit", "edge"]) colors[k] = cs.getPropertyValue(`--${k}`).trim();
}
function frameOf(p, k) {
  // e1, e2: the piece's plane; it leaves hanging in the board plane and lands flat
  const b = p.yaw * k;
  const a = (Math.PI / 2) * (1 - k) + Math.PI * 2 * Math.round(p.spin * 2 + 1) * k;
  const cb = Math.cos(b), sb = Math.sin(b), ca = Math.cos(a), sa = Math.sin(a);
  return [[cb, sb, 0], [-sb * ca, cb * ca, sa]];
}
function placeOf(p, T) {
  const box = state.box;
  if (T >= p.t1) return { c: p.pos, e: frameOf(p, 1), k: 1 };
  const k = Math.max(0, (T - p.t0) / FLIGHT);
  const [sx, sz] = slotXZ(p.slot);
  const s = [sx + (p.land[0] - 0.5) * 5, FACE_Y + 3, sz - 10];
  const e = k * k * (3 - 2 * k);
  const c = [s[0] + (p.pos[0] - s[0]) * e, s[1] + (p.pos[1] - s[1]) * e, s[2] + (p.pos[2] - s[2]) * k * k + 38 * Math.sin(Math.PI * k) * (1 - k)];
  return { c, e: frameOf(p, k), k };
}
function screenOf(p, place, Pj, dz = 0) {
  const [e1, e2] = place.e;
  return p.local.map(([u, v]) => iso([place.c[0] + e1[0] * u + e2[0] * v, place.c[1] + e1[1] * u + e2[1] * v, place.c[2] + e1[2] * u + e2[2] * v + dz], Pj));
}
function trace(g, pts) { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); }
function drawPiece(g, p, place, Pj) {
  const box = state.box;
  const bad = box.load.has(p.animal);
  const muted = state.mode === "explicit" && !bad;
  const dim = (state.sel !== null && p.animal !== state.sel) || (muted && state.sel !== null);
  const top = screenOf(p, place, Pj);
  p._poly = top;
  g.globalAlpha = dim ? 0.28 : muted ? 0.5 : 1;
  if (place.k >= 1) { trace(g, screenOf(p, place, Pj, -1.8)); g.fillStyle = muted ? colors["mute-lo"] : colors["meat-lo"]; g.fill(); }
  trace(g, top);
  const [e1, e2] = place.e;
  const nz = Math.abs(e1[0] * e2[1] - e1[1] * e2[0]);
  const shade = 0.82 + 0.18 * nz;
  g.fillStyle = muted ? colors.mute : mix(p.tone > 0.66 ? colors["meat-hi"] : colors.meat, colors["meat-lo"], shade - (p.tone % 0.33) * 0.25);
  g.fill();
  const picked = state.piece === p;
  if (picked || (state.sel === p.animal)) { g.lineWidth = picked ? 1.6 : 0.9; g.strokeStyle = colors.lit; g.globalAlpha = 1; g.stroke(); }
  else if (bad) { g.lineWidth = 1.1; g.strokeStyle = colors.bad; g.stroke(); }
  else { g.lineWidth = 0.4; g.strokeStyle = colors.edge; g.stroke(); }
  g.globalAlpha = 1;
}

let lifted = [];
let cacheKey = "", cached = 0, projection = null, kpx = 1;
function sizeCanvas() {
  const rect = stage.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round((rect.width * H / W) * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = cache.width = w; canvas.height = cache.height = h; cacheKey = ""; }
  kpx = w / W;
}
function render() {
  const T = state.T;
  const Pj = projection;
  const key = [state.az.toFixed(2), state.el.toFixed(2), state.mode, state.sel, state.piece?.key, state.loadsVersion, canvas.width, state.box.index, colors.meat].join("|");
  const pieces = state.box.pieces;
  let landed = 0;
  while (landed < pieces.length && pieces[landed].t1 <= T) landed++;
  if (key !== cacheKey || landed < cached) {
    cctx.setTransform(1, 0, 0, 1, 0, 0);
    cctx.clearRect(0, 0, cache.width, cache.height);
    cctx.setTransform(kpx, 0, 0, kpx, 0, 0);
    cached = 0; cacheKey = key;
  }
  for (; cached < landed; cached++) drawPiece(cctx, pieces[cached], placeOf(pieces[cached], Infinity), Pj);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(cache, 0, 0);
  ctx.setTransform(kpx, 0, 0, kpx, 0, 0);
  // highlighted pieces (explicit contributions, a selected carcass or piece) are lifted above the pile
  const lift = (p) => state.piece === p || (state.sel !== null ? p.animal === state.sel : state.mode === "explicit" && state.box.load.has(p.animal));
  let pile = 0;
  for (let i = 0; i < landed; i++) pile += pieces[i].mass;
  const topZ = IN_FLOOR + (pile / BOX_G) * FILL_H + 1.6;
  lifted = [];
  for (let i = 0; i < landed; i++) if (lift(pieces[i])) {
    const place = placeOf(pieces[i], Infinity);
    drawPiece(ctx, pieces[i], { ...place, c: [place.c[0], place.c[1], Math.max(place.c[2], topZ)] }, Pj);
    lifted.push(pieces[i]);
  }
  for (let i = landed; i < pieces.length && pieces[i].t0 <= T; i++) drawPiece(ctx, pieces[i], placeOf(pieces[i], T), Pj);
  return landed;
}

// ---------------------------------------------------------------- panels
const ui = {
  animals: $("[data-m=animals]"), animalsBar: $("[data-b=animals]"),
  fill: $("[data-m=fill]"), fillBar: $("[data-b=fill]"), explicit: $("[data-m=explicit]"),
  expected: $("[data-m=expected]"), observed: $("[data-m=observed]"), perCarc: $("[data-m=carcasses]"),
  inspector: $(".vp-inspect"), archive: $(".vp-archive"), tech: $("[data-m=tech]"),
  play: $("[data-act=play]"), speed: $("#vp-speed"), speedOut: $("[data-m=speed]"),
};
let lastPanel = "";
const dec = (x) => x.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function animalsStarted(T) { return Math.max(0, Math.min(60, Math.ceil(T - 1e-9))); }
function updatePanels(landed) {
  const box = state.box;
  const t = totalsOf(box, landed);
  const started = animalsStarted(state.T);
  const done = Math.min(60, Math.floor(state.T + 1e-9));
  const sig = [landed, started, state.loadsVersion, state.mode, box.index].join("|");
  frontSvg.querySelector("[data-needle]")?.setAttribute("d", needleD(projection, t.mass / 1000));
  if (sig === lastPanel) return;
  lastPanel = sig;
  ui.animals.textContent = `${started} / 60`;
  ui.animalsBar.style.width = `${(started / 60) * 100}%`;
  ui.fill.textContent = `${fmt(t.mass / 1000, 0)} kg`;
  ui.fillBar.style.width = `${Math.min(100, t.mass / 1e4)}%`;
  ui.explicit.textContent = `${fmt(t.explicitMass / 1000)} kg in ${t.explicitPieces} pieces from ${box.load.size} carcass${box.load.size === 1 ? "" : "es"}`;
  ui.expected.textContent = dec(t.expected);
  ui.observed.textContent = String(t.observed);
  ui.perCarc.innerHTML = [...box.load.entries()].sort((a, b) => a[0] - b[0]).map(([id, load]) => {
    const a = box.animals[id - box.first];
    const here = a.pieces.filter((p) => p.t1 <= state.T);
    const e = here.reduce((s, p) => s + expectedOf(p, load), 0);
    return `<li><button type="button" class="chip bad" data-pick="${id}">#${id}</button> load ${fmt(load, 0)} · ${here.length}/${a.pieces.length} pieces landed · expected ${fmt(e, 1)}</li>`;
  }).join("") || "<li>No contaminated carcass in this box.</li>";
  readout.textContent = `animal ${done} of 60 · ${fmt(t.mass / 1000, 0)} kg`;
  // carcass board states
  for (const g of backSvg.querySelectorAll("[data-animal]")) {
    const id = Number(g.dataset.animal), slot = id - box.first;
    g.toggleAttribute("data-bad", box.load.has(id));
    g.toggleAttribute("data-sel", state.sel === id);
    g.toggleAttribute("data-active", slot < started && slot >= done);
    g.toggleAttribute("data-done", slot < done);
  }
  renderInspector();
}

function renderInspector() {
  const box = state.box;
  if (state.piece) {
    const p = state.piece, load = box.load.get(p.animal);
    const e = expectedOf(p, load), o = observedOf(p, load);
    ui.inspector.innerHTML = `<h3>Piece ${p.n + 1} of animal <button type="button" class="chip${load !== undefined ? " bad" : ""}" data-pick="${p.animal}">#${p.animal}</button></h3>
      <dl><dt>Mass</dt><dd>${p.mass.toFixed(0)} g</dd><dt>Surface ratio</dt><dd>${p.ratio.toFixed(3)} cm²/g</dd><dt>Surface area</dt><dd>${p.area.toFixed(1)} cm²</dd>
      <dt>Expected organisms</dt><dd>${load !== undefined ? `${e.toPrecision(3)} <small>= ${fmt(load, 0)} × ${p.area.toFixed(1)} / 32,000</small>` : "0 · not explicitly simulated"}</dd>
      <dt>Observed count</dt><dd>${load !== undefined ? `${o} <small>one Poisson draw, illustrative</small>` : "—"}</dd></dl>
      <p class="hint">${load !== undefined ? "Red outline: this piece comes from a contaminated carcass. It shows origin; a given piece may still carry no bacteria." : "This animal is not contaminated in this demonstration, so the R model generates no pieces for it."}</p>`;
    return;
  }
  if (state.sel !== null) {
    const a = box.animals[state.sel - box.first];
    const load = box.load.get(a.id);
    const mass = a.pieces.reduce((s, p) => s + p.mass, 0);
    const e = load !== undefined ? a.pieces.reduce((s, p) => s + expectedOf(p, load), 0) : 0;
    ui.inspector.innerHTML = `<h3>Animal #${a.id}</h3>
      <label class="check"><input type="checkbox" id="vp-bad" ${load !== undefined ? "checked" : ""}> Contaminated carcass (demonstration setting)</label>
      <label class="num">Load allocated to beef for mincing <input type="number" id="vp-load" min="0" step="any" value="${load ?? 1000}" ${load === undefined ? "disabled" : ""}> organisms</label>
      <dl><dt>Pieces into this box</dt><dd>${a.pieces.length} <small>Poisson(${(NOTRM / 60).toFixed(1)}) draw</small></dd><dt>Mass of those pieces</dt><dd>${(mass / 1000).toFixed(1)} kg</dd>
      <dt>Expected organisms, all pieces</dt><dd>${load !== undefined ? e.toPrecision(3) : "0"}</dd></dl>
      <p class="hint">Highlighted in the box. Other meat from this animal, which may go to other boxes, is not tracked.</p>`;
    return;
  }
  ui.inspector.innerHTML = `<h3>Inspect</h3><p class="hint">Click a carcass on the board to see its pieces and set whether it is contaminated, or click a piece in the box to see its mass, surface and expected organisms.</p>`;
}

function renderArchive() {
  const rows = [...state.archive, { live: true, ...summary(state.box, true) }];
  const max = Math.max(10, ...rows.map((r) => r.expected));
  ui.archive.innerHTML = `<li class="head"><span>Box</span><span>Animals</span><span>Contaminated carcasses</span><span>Expected organisms (log scale)</span><span class="num">Expected</span><span class="num">Observed</span></li>` + rows.map((r) => `<li${r.live ? " data-live" : ""}><b>Box ${r.index + 1}</b><span>animals ${r.first}–${r.first + 59}</span><span>${r.contaminated.length ? r.contaminated.map((c) => "#" + c).join(", ") : "none"}</span><span class="bar"><i style="width:${r.expected > 0 ? Math.max(2, (Math.log10(1 + r.expected) / Math.log10(1 + max)) * 100) : 0}%"></i></span><span class="num">${dec(r.expected)}</span><span class="num">${r.observed}</span></li>`).join("");
}
function summary(box, partial) {
  const t = totalsOf(box);
  return { index: box.index, first: box.first, contaminated: [...box.load.keys()].sort((a, b) => a - b), expected: t.expected, observed: t.observed, mass: t.mass };
}

// ---------------------------------------------------------------- loop
let frame = 0, last = 0, visible = true, dirtyStatic = true;
function rebuildStatic() {
  projection = P();
  backSvg.innerHTML = buildBack(projection);
  frontSvg.innerHTML = buildFront(projection);
  dirtyStatic = false;
  lastPanel = "";
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  let moving = false;
  for (const k of ["az", "el"]) {
    const d = state.view[k] - state[k];
    if (Math.abs(d) > 0.02) { state[k] += d * (still.matches ? 1 : 1 - Math.exp(-dt / 0.14)); dirtyStatic = true; moving = true; }
    else if (d) { state[k] = state.view[k]; dirtyStatic = true; }
  }
  if (state.playing) {
    state.T = Math.min(END, state.T + dt * state.speed);
    if (state.T >= END) setPlaying(false);
    moving = true;
  }
  if (dirtyStatic) rebuildStatic();
  const landed = render();
  updatePanels(landed);
  frame = visible && (moving || state.playing) ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame) { last = 0; frame = requestAnimationFrame(tick); } };
function setPlaying(on) {
  if (on && state.T >= END) return;
  state.playing = on;
  ui.play.textContent = on ? "Pause" : "Play";
  ui.play.setAttribute("aria-pressed", String(on));
  run();
}
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
new ResizeObserver(() => { sizeCanvas(); if (projection) render(); run(); }).observe(stage);
matchMedia("(resolution: 1dppx)").addEventListener?.("change", () => { sizeCanvas(); if (projection) render(); });
const retheme = () => { readColors(); cacheKey = ""; run(); };
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", retheme);
new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

// ---------------------------------------------------------------- input
function pickPiece(x, y) {
  const pieces = state.box.pieces;
  const inside = (pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  for (let i = lifted.length - 1; i >= 0; i--) if (inside(lifted[i]._poly)) return lifted[i];
  for (let i = pieces.length - 1; i >= 0; i--) if (pieces[i].t0 <= state.T && pieces[i]._poly && inside(pieces[i]._poly)) return pieces[i];
  return null;
}
let drag = null;
stage.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, az: state.view.az, el: state.view.el, moved: false, id: e.pointerId }; });
stage.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; stage.classList.add("dragging"); try { stage.setPointerCapture(drag.id); } catch {} }
  if (!drag.moved) return;
  state.view.az = Math.max(22, Math.min(88, drag.az - dx * 0.3));
  state.view.el = Math.max(14, Math.min(55, drag.el + dy * 0.2));
  run();
});
function select(animal, piece = null) { state.sel = animal; state.piece = piece; lastPanel = ""; run(); }
const endDrag = (e) => {
  if (!drag) return;
  const moved = drag.moved;
  stage.classList.remove("dragging");
  try { stage.releasePointerCapture(drag.id); } catch {}
  drag = null;
  if (moved || e.type === "pointercancel") return;
  const rect = stage.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * W, y = ((e.clientY - rect.top) / rect.width) * W;
  const onWall = document.elementsFromPoint(e.clientX, e.clientY).some((el) => el.closest && el.closest(".vp-front .wall, .vp-front .plate"));
  const piece = onWall ? null : pickPiece(x, y);
  if (piece) return select(null, piece);
  const carc = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest && el.closest("[data-animal]")).find(Boolean);
  if (carc) { const id = Number(carc.dataset.animal); return select(state.sel === id ? null : id); }
  select(null);
};
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);

document.addEventListener("click", (e) => {
  const pick = e.target.closest("[data-pick]");
  if (pick) select(Number(pick.dataset.pick));
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act) return;
  if (act === "play") setPlaying(!state.playing);
  if (act === "next") { setPlaying(false); state.T = Math.min(60, Math.floor(state.T + 1e-9) + 1); }
  if (act === "fill") { setPlaying(false); state.T = END; }
  if (act === "reset") { setPlaying(false); state.T = 0; state.piece = null; }
  if (act === "box") {
    setPlaying(false);
    state.T = END;
    state.archive.push(summary(state.box));
    state.box = newBox(state.box.index + 1);
    state.T = 0; state.sel = null; state.piece = null; dirtyStatic = true; cacheKey = "";
    renderArchive();
    setPlaying(!still.matches);
  }
  lastPanel = ""; run();
});
document.addEventListener("change", (e) => {
  if (e.target.name === "vp-mode") { state.mode = e.target.value; document.documentElement.style.setProperty("--x", "0"); stage.dataset.mode = state.mode; lastPanel = ""; run(); }
  if (e.target.id === "vp-bad" && state.sel !== null) {
    if (e.target.checked) state.box.load.set(state.sel, 1000); else state.box.load.delete(state.sel);
    state.loadsVersion++; lastPanel = ""; renderArchive(); run();
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "vp-load" && state.sel !== null) {
    const v = Number(e.target.value);
    if (Number.isFinite(v) && v >= 0) { state.box.load.set(state.sel, v); state.loadsVersion++; lastPanel = ""; updatePanelsKeepFocus(); renderArchive(); run(); }
  }
  if (e.target.id === "vp-speed") { state.speed = Number(e.target.value); ui.speedOut.textContent = `${state.speed.toFixed(2)} animals/s`; }
});
function updatePanelsKeepFocus() {
  // don't rebuild the inspector while the reader is typing a load
  const save = renderInspector;
  renderInspector = () => {};
  try { updatePanels(render()); } finally { renderInspector = save; }
}
stage.addEventListener("keydown", (e) => {
  let handled = true;
  if (e.key === " " || e.key === "Enter") setPlaying(!state.playing);
  else if (e.key === "ArrowRight") { setPlaying(false); state.T = Math.min(60, Math.floor(state.T + 1e-9) + 1); }
  else if (e.key === "ArrowLeft") state.view.az = Math.min(88, state.view.az + 8);
  else if (e.key === "ArrowUp") state.view.el = Math.min(55, state.view.el + 4);
  else if (e.key === "ArrowDown") state.view.el = Math.max(14, state.view.el - 4);
  else if (e.key === "Escape") select(null);
  else handled = false;
  if (handled) { e.preventDefault(); lastPanel = ""; run(); }
});

// ---------------------------------------------------------------- start
ui.tech.innerHTML = ui.tech.innerHTML.replace("{NOTRM}", NOTRM.toLocaleString("en-US")).replace("{LAMBDA}", (NOTRM / 60).toFixed(2));
readColors();
sizeCanvas();
if (still.matches) state.T = END;
renderArchive();
setPlaying(state.playing);
run();
window.__vp = state; window.__vpPick = (x, y) => pickPiece(x, y)?.key; window.__vpDebug = () => ({ cached, w: canvas.width, cw: cache.width, frame, visible, playing: state.playing, T: state.T });
