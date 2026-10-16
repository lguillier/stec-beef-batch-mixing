import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../vendor/anatomy/kit/iso-kit.mjs";
import { kitScript } from "../vendor/anatomy/scripts/inline-kit.mjs";
import { levelsOf } from "./model.mjs";
import { sceneSvg, W, H } from "./scene.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const theme = process.argv.includes("--light") ? "light" : "dark";
const out = theme === "light" ? "batch-mixing-light.html" : "batch-mixing.html";

const START = { g: 0, azimuth: 38, elevation: 32, contaminated: new Set(["G2"]), focus: null };
START.levels = levelsOf(START.contaminated);
const first = sceneSvg(START);

const LABEL =
  "An isometric minced-beef batching line. Three gravity flow racks hold 1000 kg raw material units: chilled fatty (R-G), chilled lean (R-M) and frozen (C). Pieces from the open unit of each rack ride a belt into a twin-paddle mixer; each 1000 kg batch is discharged into a tote that is pushed down a roller line, and a ticket on each tote shows which units it contains.";

const svg = k.figureSvg({ width: W, height: H, label: LABEL, body: `<g data-scene>${first.body}</g>` });

// The page re-runs the same model and scene code: strip module syntax and inline it.
const source = (file) =>
  readFileSync(join(HERE, file), "utf8")
    .replace(/^import[^;]+;\n/gm, "")
    .replace(/^export /gm, "");

const CSS = `
.iso{--mince:#b65a5e;--carry:#d4d4d4;--bad:#ff6b6b}
.iso[data-theme="light"]{--mince:#c46a6c;--carry:#26262a;--bad:#e5484d}
.in-dark{fill:var(--anatomy-shade-0);stroke:none}
.in-wall{fill:var(--anatomy-shade-1);stroke:none}
.in-wall[data-shade="1"]{fill:var(--anatomy-shade-2)}
.meat,.band{stroke:none}
.plate{fill:var(--anatomy-top);stroke:none}
.plate.bad{fill:color-mix(in oklab,var(--bad) 22%,var(--anatomy-top))}
.tag{fill:var(--bad);stroke:none}
.chunk .iso-fill{fill:var(--u)}
.chunk .iso-top{fill:color-mix(in oklab,var(--u),white 12%)}
.chunk .iso-shade{fill:color-mix(in oklab,var(--u),black 28%)}
.bad-dot circle{fill:var(--bad)!important;opacity:1!important}
.pick{cursor:pointer}
.bm-stage{touch-action:pan-y;cursor:grab;outline:none;user-select:none;-webkit-user-select:none}
.bm-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
.bm-stage.dragging{cursor:grabbing}
.bm-controls{display:flex;align-items:center;gap:10px;margin:14px auto 0;max-width:720px;font-family:var(--anatomy-mono);font-size:11px;color:var(--anatomy-muted)}
.bm-controls button{font:inherit;color:var(--anatomy-text);background:transparent;border:1px solid var(--anatomy-lo);padding:4px 9px;cursor:pointer;border-radius:0}
.bm-controls button:hover{border-color:var(--anatomy-mid);color:var(--anatomy-strong)}
.bm-controls input[type=range]{flex:1;accent-color:var(--anatomy-mid)}
.bm-strip{display:grid;grid-template-columns:repeat(8,1fr);gap:6px;max-width:720px;margin:14px auto 0}
.bm-cell{display:grid;gap:4px;font-family:var(--anatomy-mono);font-size:10px;color:var(--anatomy-muted);text-align:center;cursor:pointer;background:none;border:0;padding:0}
.bm-bar{display:flex;flex-direction:column;height:56px;border:1px solid var(--anatomy-lo);background:var(--anatomy-paper)}
.bm-bar i{display:block}
.bm-cell[data-on] .bm-bar{border-color:var(--anatomy-hi)}
.bm-cell[data-bad] b{color:var(--bad)}
.bm-cell b{font-weight:400;color:var(--anatomy-text)}
.bm-detail{max-width:720px;margin:12px auto 0;font-size:12.5px;line-height:1.55;color:var(--anatomy-text);min-height:3.2em}
.bm-detail em{font-style:normal;color:var(--anatomy-strong)}
.bm-detail .sw{display:inline-block;width:9px;height:9px;margin:0 4px 0 2px;vertical-align:-1px}
@media (max-width:560px){.bm-strip{gap:3px}.bm-bar{height:40px}.bm-controls{flex-wrap:wrap}}
`;

const live = `
${source("model.mjs")}
${source("scene.mjs")}
const stage = document.querySelector(".bm-stage");
const svg = stage.querySelector("svg");
const scene = svg.querySelector("[data-scene]");
const readout = document.querySelector("[data-readout]");
const range = document.querySelector("[data-time]");
const playBtn = document.querySelector("[data-play]");
const strip = document.querySelector(".bm-strip");
const detail = document.querySelector(".bm-detail");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const state = { g: 0, azimuth: ${START.azimuth}, elevation: ${START.elevation}, contaminated: new Set(["G2"]), focus: null, levels: null };
const view = { azimuth: state.azimuth, elevation: state.elevation };
let playing = !still.matches, holdUntil = 0, visible = false, frame = 0, last = 0, dirty = true;
const RATE = 0.22; // batches per second while playing
const PHASES = [[PHASE.transfer, "loading"], [PHASE.mix, "mixing"], [PHASE.discharge, "discharging"], [1, "indexing"]];
const phaseOf = (g) => { if (g >= BATCHES) return "8 batches made"; const u = g - Math.floor(g); return PHASES.find(([end]) => u < end)[1]; };
const swatch = (id) => '<span class="sw" style="background:' + colourOf(id) + '"></span>';
const nameOf = (id) => id === "carry" ? "carry-over" : id;

function recompute() { state.levels = levelsOf(state.contaminated); }

function stripHtml() {
  strip.innerHTML = Array.from({ length: BATCHES }, (_, n) => {
    const parts = recipeOf(n);
    const order = ["G", "M", "C", "c"];
    parts.sort((a, b) => order.indexOf(a.id[0]) - order.indexOf(b.id[0]) || a.id.localeCompare(b.id));
    const bars = parts.map((p) => '<i style="flex:' + (p.id === "carry" ? 0.02 : p.kg / 1000) + ';background:' + colourOf(p.id) + '" title="' + nameOf(p.id) + ' ' + pct(p.kg / 1000) + '"></i>').join("");
    const level = state.levels[n];
    const text = level > 0 ? pct(level) : "clean";
    return '<button class="bm-cell" data-batch="' + n + '"' + (level > 0 ? " data-bad" : "") + (state.focus === "b" + n ? " data-on" : "") + ' aria-label="Batch ' + (n + 1) + ', ' + text + '"><span>' + (n + 1) + '</span><span class="bm-bar">' + bars + '</span><b>' + text + '</b></button>';
  }).join("");
}

function detailHtml() {
  const f = state.focus;
  const bad = [...state.contaminated].sort();
  const badText = bad.length ? "Contaminated: " + bad.map((id) => swatch(id) + "<em>" + id + "</em>").join(", ") + "." : "No unit is contaminated: click a unit to tag it.";
  if (f && f[0] === "b") {
    const n = Number(f.slice(1));
    const parts = recipeOf(n).map((p) => swatch(p.id) + "<em>" + (p.id === "carry" ? "0.1% of batch " + n : pct(p.kg / 1000) + " " + p.id) + "</em>");
    const lv = state.levels[n];
    return "Batch <em>" + (n + 1) + "</em> = " + parts.join(" + ") + ". Level: <em>" + (lv > 0 ? pct(lv) : "0") + "</em> of a contaminated unit's concentration. " + badText;
  }
  if (f) {
    const fed = batchesOf(f);
    const kg = fed.map((n) => ALLOC[n][f]);
    return "Unit <em>" + f + "</em> (1000 kg) went into batch" + (fed.length > 1 ? "es " : " ") + fed.map((n, i) => "<em>" + (n + 1) + "</em> (" + Math.round(kg[i]) + " kg)").join(", ") + (fed.length ? "" : " none yet: it is a spare") + ". " + badText;
  }
  return "A unit enters every batch it is drawn into until it runs out; then the next unit of the same type is opened, so a batch can hold two units of one type. Each batch also keeps 1 kg (0.1%) of the one before. " + badText;
}

function say() {
  const n = Math.min(BATCHES, Math.floor(state.g) + 1);
  const text = state.g >= BATCHES ? "8 batches · " + ALLOC.filter((parts) => Object.keys(parts).some((id) => state.contaminated.has(id))).length + " share a tagged unit" : "batch " + n + " of 8 · " + phaseOf(state.g);
  if (readout.textContent !== text) readout.textContent = text;
  range.value = String(state.g);
}

function draw() {
  scene.innerHTML = sceneSvg(state).body;
  say();
}

function refreshPanels() { stripHtml(); detail.innerHTML = detailHtml(); }

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  const calm = still.matches;
  if (playing) {
    if (state.g >= BATCHES) {
      if (!holdUntil) holdUntil = now + 3500;
      if (now > holdUntil) { state.g = 0; holdUntil = 0; }
    } else state.g = Math.min(BATCHES, state.g + dt * RATE);
    dirty = true;
  }
  const ease = calm ? 1 : 1 - Math.exp(-dt / 0.16);
  for (const key of ["azimuth", "elevation"]) {
    const d = view[key] - state[key];
    if (Math.abs(d) > 0.01) { state[key] += d * ease; dirty = true; } else if (d) { state[key] = view[key]; dirty = true; }
  }
  if (dirty) { draw(); dirty = false; }
  const moving = playing || Math.abs(view.azimuth - state.azimuth) > 0 || Math.abs(view.elevation - state.elevation) > 0;
  frame = visible && moving ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible) { last = 0; frame = requestAnimationFrame(tick); } };
const setPlaying = (on) => { playing = on; playBtn.textContent = on ? "pause" : "play"; playBtn.setAttribute("aria-pressed", String(on)); if (on && state.g >= BATCHES) state.g = 0; run(); };
new IntersectionObserver((entries) => { visible = entries[entries.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);

// drag to orbit, click to pick
let drag = null;
stage.addEventListener("pointerdown", (event) => {
  drag = { x: event.clientX, y: event.clientY, az: view.azimuth, el: view.elevation, moved: false, id: event.pointerId };
});
stage.addEventListener("pointermove", (event) => {
  if (!drag) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; stage.classList.add("dragging"); try { stage.setPointerCapture(drag.id); } catch {} }
  if (!drag.moved) return;
  view.azimuth = drag.az - dx * 0.35;
  view.elevation = Math.max(12, Math.min(70, drag.el + dy * 0.25));
  run();
});
const endDrag = (event) => {
  if (!drag) return;
  const wasMoved = drag.moved;
  stage.classList.remove("dragging");
  try { stage.releasePointerCapture(drag.id); } catch {}
  drag = null;
  if (wasMoved || event.type === "pointercancel") return;
  const hit = event.target.closest && event.target.closest("[data-id]");
  if (!hit) { state.focus = null; refreshPanels(); dirty = true; draw(); return; }
  const id = hit.getAttribute("data-id");
  if (id[0] === "b") state.focus = state.focus === id ? null : id;
  else {
    if (state.contaminated.has(id)) state.contaminated.delete(id); else state.contaminated.add(id);
    state.focus = id;
    recompute();
  }
  refreshPanels();
  draw();
};
stage.addEventListener("pointerup", endDrag);
stage.addEventListener("pointercancel", endDrag);

strip.addEventListener("click", (event) => {
  const cell = event.target.closest("[data-batch]");
  if (!cell) return;
  const n = Number(cell.dataset.batch);
  state.focus = state.focus === "b" + n ? null : "b" + n;
  if (state.g < n + 1) { setPlaying(false); state.g = n + 1; }
  refreshPanels(); draw();
});
range.addEventListener("input", () => { setPlaying(false); state.g = Number(range.value); draw(); });
playBtn.addEventListener("click", () => setPlaying(!playing));
document.querySelector("[data-reset]").addEventListener("click", () => { view.azimuth = ${START.azimuth}; view.elevation = ${START.elevation}; state.contaminated = new Set(["G2"]); state.focus = null; recompute(); refreshPanels(); dirty = true; run(); draw(); });
document.querySelector("[data-clear]").addEventListener("click", () => { state.contaminated.clear(); recompute(); refreshPanels(); draw(); });

stage.addEventListener("keydown", (event) => {
  const big = event.shiftKey;
  let handled = true;
  if (event.key === "ArrowRight" && !big) { setPlaying(false); state.g = Math.min(BATCHES, Math.floor(state.g + 1e-6) + 1); }
  else if (event.key === "ArrowLeft" && !big) { setPlaying(false); state.g = Math.max(0, Math.ceil(state.g - 1e-6) - 1); }
  else if (event.key === "ArrowRight") view.azimuth -= 15;
  else if (event.key === "ArrowLeft") view.azimuth += 15;
  else if (event.key === "ArrowUp") view.elevation = Math.min(70, view.elevation + 5);
  else if (event.key === "ArrowDown") view.elevation = Math.max(12, view.elevation - 5);
  else if (event.key === "Home") { setPlaying(false); state.g = 0; }
  else if (event.key === "End") { setPlaying(false); state.g = BATCHES; }
  else if (event.key === " " || event.key === "Enter") setPlaying(!playing);
  else if (event.key === "Escape") { state.focus = null; refreshPanels(); }
  else handled = false;
  if (!handled) return;
  event.preventDefault();
  stage.setAttribute("aria-valuenow", String(Math.floor(state.g)));
  stage.setAttribute("aria-valuetext", "after " + Math.floor(state.g) + " of 8 batches");
  draw(); run();
});

recompute();
refreshPanels();
setPlaying(!still.matches);
if (still.matches) { state.g = BATCHES; }
draw();
window.__bm = state; window.__bmDraw = () => sceneSvg(state).body;
`;

const controls = `<div class="bm-controls"><button type="button" data-play aria-pressed="true">pause</button><input type="range" min="0" max="8" step="0.01" value="0" data-time aria-label="Batches made"><button type="button" data-clear>clear</button><button type="button" data-reset>reset</button></div><div class="bm-strip" aria-label="Batch tickets"></div><p class="bm-detail" aria-live="polite"></p>`;

const body = k.plateHtml({
  fig: "Fig 12",
  title: "Units into eight batches",
  hint: "Drag to orbit · click a unit",
  readout: "batch 1 of 8 · loading",
  keys: [
    { mark: "raised", label: "R-G chilled fatty · 60% of each batch" },
    { mark: "raised", label: "R-M chilled lean · 30%" },
    { mark: "raised", label: "C frozen · 10%" },
    { mark: "red", label: "Tagged unit, and batches holding ≥0.1% of it (dot: carry-over trace only)" },
    { mark: "lit", label: "Selected unit or batch and its links" },
  ],
  caption:
    "After ANSES opinion 2016-SA-0121, Figure 12. Raw material units (VPH) of 1000 kg are opened one at a time on each rack and drawn first in, first out into 1000 kg batches (mêlées) of 60% chilled fatty, 30% chilled lean and 10% frozen meat, plus 1 kg (0.1%) left in the mixer from the batch before. A fatty unit runs out after 1⅔ batches, a lean one after 3⅓ and a frozen one after 10, so the eight batches use 5 fatty, 3 lean and 1 frozen unit, and batches 2, 4 and 7 hold two units of the same type. Each tote's ticket (and the strip below) shows its make-up, with the carry-over band drawn 20 times thicker so it can be seen. Tagging a unit as contaminated shows which batches share it: the level is the fraction of that unit's concentration that ends up in the batch, from its own share plus the carry-over chain.",
  body: `<div class="bm-stage" tabindex="0" role="slider" aria-label="Batching line. Left and right arrows step one batch, Shift with arrows or drag to orbit, up and down tilt, Space plays or pauses." aria-valuemin="0" aria-valuemax="8" aria-valuenow="0">${svg}</div>${controls}`,
});

const html = k.pageHtml({ title: "Batch mixing", theme, body, script: kitScript() + live, width: 980 }).replace("</style>", CSS + "</style>");
writeFileSync(join(HERE, out), html);
console.log("wrote", out, (html.length / 1024).toFixed(0) + " KB");

// Shareable artifact page: no document skeleton, follows the viewer's light/dark theme.
{
  const iso = k.ISO_CSS;
  const block = (selector) => {
    const start = iso.indexOf(selector + "{");
    const end = iso.indexOf("}", start);
    return { text: iso.slice(start, end + 1), body: iso.slice(start + selector.length + 1, end) };
  };
  const dark = block(".iso");
  const light = block('.iso[data-theme="light"]');
  const rest = iso.replace(dark.text, "").replace(light.text, "");
  const LIGHT_EXTRA = "--mince:#c46a6c;--carry:#26262a;--bad:#e5484d;color-scheme:light";
  const DARK_EXTRA = "--mince:#b65a5e;--carry:#d4d4d4;--bad:#ff6b6b;color-scheme:dark";
  const tokens = `
:root{${dark.body};${DARK_EXTRA}}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){${light.body};${LIGHT_EXTRA}}}
:root[data-theme="light"]{${light.body};${LIGHT_EXTRA}}
:root[data-theme="dark"]{${dark.body};${DARK_EXTRA}}
`;
  const page = `
*{box-sizing:border-box}
body{background:var(--anatomy-page);color:var(--anatomy-text);font:14px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:24px 48px}
.iso-page{width:min(980px,100%);margin:0 auto}
.iso-page .iso-figure{margin:8px 0 16px}
`;
  const ownCss = CSS.replace(/^\.iso\{[^\n]*\n/m, "").replace(/^\.iso\[data-theme="light"\]\{[^\n]*\n/m, "");
  // Standalone page for docs/: follows the reader's light or dark theme.
  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Batch Mixing Line</title>
<style>${tokens}${rest}${page}${ownCss}</style>
</head>
<body>
<main class="iso iso-page">${body}</main>
<script type="module">${(kitScript() + live).replace(/<\/(script)/gi, "<\\/$1")}</script>
</body>
</html>
`;
  writeFileSync(join(HERE, "..", "docs", "batch-mixing.html"), doc);
  console.log("wrote docs/batch-mixing.html");
}
