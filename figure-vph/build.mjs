import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../vendor/anatomy/kit/iso-kit.mjs";
import { kitScript } from "../vendor/anatomy/scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const src = (f) => readFileSync(join(HERE, f), "utf8").replace(/^import[^;]+;\n/gm, "").replace(/^export /gm, "");

// Kit tokens on :root, dark first, light by preference or explicit choice.
const iso = k.ISO_CSS;
const block = (sel) => { const a = iso.indexOf(sel + "{"); const b = iso.indexOf("}", a); return { text: iso.slice(a, b + 1), body: iso.slice(a + sel.length + 1, b) }; };
const dark = block(".iso"), light = block('.iso[data-theme="light"]');
const rest = iso.replace(dark.text, "").replace(light.text, "");
const DARK = "--meat:#b8565a;--meat-hi:#cf7a70;--meat-lo:#5e272b;--mute:#4b4b4e;--mute-lo:#2b2b2d;--bad:#ff6b6b;--lit:#ffffff;--edge:#3a1d20;--carc-fill:#262628;--carc-done:#4a2a2d;--panel:#161617;color-scheme:dark";
const LIGHT = "--meat:#c8686b;--meat-hi:#de9184;--meat-lo:#8a3c40;--mute:#cfcfcc;--mute-lo:#aeaeab;--bad:#e5484d;--lit:#000000;--edge:#7a3236;--carc-fill:#ececea;--carc-done:#f0d5d3;--panel:#ffffff;color-scheme:light";
const TOKENS = `
:root{${dark.body};${DARK}}
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){${light.body};${LIGHT}}}
:root[data-theme="light"]{${light.body};${LIGHT}}
:root[data-theme="dark"]{${dark.body};${DARK}}`;

const CSS = `
*{box-sizing:border-box}
body{background:var(--anatomy-page);color:var(--anatomy-text);font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:28px 56px}
.vp{width:min(1220px,100%);margin:0 auto;display:grid;gap:22px}
.vp header{display:grid;gap:8px;max-width:70ch}
.eyebrow{margin:0;font-family:var(--anatomy-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--anatomy-muted)}
h1{margin:0;font-size:clamp(24px,3.4vw,34px);line-height:1.15;font-weight:600;color:var(--anatomy-strong);text-wrap:balance;letter-spacing:-.01em}
.lede{margin:0;font-size:17px;color:var(--anatomy-strong)}
.vp-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;align-items:start}
@media (max-width:940px){.vp-grid{grid-template-columns:minmax(0,1fr)}}
.vp-main{min-width:0;display:grid;gap:12px}
.vp-main .iso-figure{margin:0}
.vp-stage{position:relative;touch-action:pan-y;cursor:grab;user-select:none;-webkit-user-select:none;outline:none}
.vp-stage:focus-visible{outline:1px solid var(--anatomy-muted);outline-offset:6px}
.vp-stage.dragging{cursor:grabbing}
.vp-stage .vp-back{position:relative;z-index:0}.vp-stage canvas,.vp-stage .vp-front{position:absolute;inset:0;width:100%;height:auto;pointer-events:none;z-index:1}.vp-stage .vp-front{z-index:2}
.vp-front .wall,.vp-front .plate{pointer-events:visiblePainted}
.in-dark{fill:var(--anatomy-shade-0);stroke:none}.in-wall{fill:var(--anatomy-shade-1);stroke:none}.in-wall[data-shade="1"]{fill:var(--anatomy-shade-2)}.in-floor{fill:var(--anatomy-shade-1);stroke:none}
.plate{fill:var(--anatomy-top);stroke:none}
.carc{cursor:pointer}
.carc-body{fill:var(--carc-fill);stroke:var(--anatomy-mid);stroke-width:.6;transition:fill .3s}
.carc[data-done] .carc-body{fill:var(--carc-done)}
.carc[data-active] .carc-body{stroke:var(--anatomy-lit);stroke-width:1.1}
.carc[data-bad] .carc-body{stroke:var(--bad);stroke-width:1.5}
.carc[data-sel] .carc-body{stroke:var(--anatomy-lit);stroke-width:2}
.carc[data-bad] text{fill:var(--bad)}
.vp-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
button{font:inherit;font-size:13px;color:var(--anatomy-strong);background:var(--panel);border:1px solid var(--anatomy-lo);padding:6px 12px;cursor:pointer;border-radius:3px}
button:hover{border-color:var(--anatomy-mid)}
button:focus-visible,input:focus-visible{outline:2px solid var(--anatomy-mid);outline-offset:2px}
button[data-act=play]{min-width:70px}
button[data-act=box]{margin-left:auto}
.speed{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--anatomy-muted);font-variant-numeric:tabular-nums}
.speed input{width:120px;accent-color:var(--anatomy-mid)}
.vp-side{display:grid;gap:14px;min-width:0}
.card{background:var(--panel);border:1px solid var(--anatomy-faint);padding:14px 16px;display:grid;gap:10px;border-radius:4px}
.card h2,.card h3{margin:0;font-size:11px;font-family:var(--anatomy-mono);letter-spacing:.1em;text-transform:uppercase;color:var(--anatomy-muted);font-weight:400}
.card h3{font-size:12px;text-transform:none;letter-spacing:.02em;color:var(--anatomy-strong);font-family:inherit;font-weight:600}
.modes{display:grid;gap:6px;border:0;margin:0;padding:0}
.modes label{display:flex;gap:8px;align-items:baseline;font-size:14px;color:var(--anatomy-strong);cursor:pointer}
.modes p{margin:0;font-size:12.5px;color:var(--anatomy-text)}
.meter{display:grid;gap:4px}
.meter .row{display:flex;justify-content:space-between;gap:8px;font-size:13px}
.meter .row b{font-weight:600;color:var(--anatomy-strong);font-variant-numeric:tabular-nums}
.track{height:6px;background:var(--anatomy-faint);border-radius:3px;overflow:hidden}
.track i{display:block;height:100%;width:0;background:var(--anatomy-mid);transition:width .2s}
.track.fill i{background:var(--meat)}
.meter small,.hint,dd small{color:var(--anatomy-muted);font-size:12px}
.hint{margin:0}
.big{font-size:26px;line-height:1.1;font-weight:600;color:var(--anatomy-strong);font-variant-numeric:tabular-nums}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pair div{display:grid;gap:2px}
ul.list{margin:0;padding:0;list-style:none;display:grid;gap:6px;font-size:12.5px}
.chip{padding:1px 7px;font-size:12px;font-family:var(--anatomy-mono);border-radius:10px}
.chip.bad{border-color:var(--bad);color:var(--bad)}
dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0;font-size:13px}
dt{color:var(--anatomy-muted)}dd{margin:0;color:var(--anatomy-strong);font-variant-numeric:tabular-nums}
label.check,label.num{display:flex;gap:8px;align-items:center;font-size:13px;flex-wrap:wrap}
label.num input{width:110px;font:inherit;font-size:13px;padding:3px 6px;background:var(--anatomy-page);color:var(--anatomy-strong);border:1px solid var(--anatomy-lo);border-radius:3px}
.archive h2{margin:0}
.vp-archive{margin:0;padding:0;list-style:none;display:grid;gap:4px;font-size:13px;overflow-x:auto}
.vp-archive li{display:grid;grid-template-columns:62px 130px minmax(110px,1fr) minmax(100px,2fr) 80px 70px;gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--anatomy-faint);min-width:600px}
.vp-archive li.head{color:var(--anatomy-muted);font-size:11.5px;border-top:0}
.vp-archive li[data-live] b::after{content:" · now";font-weight:400;color:var(--anatomy-muted)}
.vp-archive .bar{height:8px;background:var(--anatomy-faint);border-radius:4px;overflow:hidden}.vp-archive .bar i{display:block;height:100%;background:var(--bad)}
.vp-archive .num{text-align:right;font-variant-numeric:tabular-nums;color:var(--anatomy-strong)}
details.tech{border:1px solid var(--anatomy-faint);background:var(--panel);border-radius:4px;padding:0 16px}
details.tech summary{cursor:pointer;padding:12px 0;font-weight:600;color:var(--anatomy-strong)}
details.tech ol{margin:0 0 12px;padding-left:20px;display:grid;gap:6px;max-width:80ch}
details.tech p{max-width:80ch}
code{font-family:var(--anatomy-mono);font-size:12.5px}
.note{margin:0;font-size:13px;color:var(--anatomy-muted);max-width:80ch}
`;

const svgAttrs = `viewBox="0 0 960 640" role="img"`;
const stage = `<div class="vp-stage" tabindex="0" role="group" aria-label="Carcass board and VPH box. Space plays or pauses, right arrow adds the next animal, left arrow and up and down turn the view, Escape clears the selection." data-mode="physical"><svg class="iso-svg vp-back" ${svgAttrs} aria-label="A board of 60 numbered carcass sides above a 1000 kg VPH box standing on a platform scale. Meat pieces of different sizes fall from each carcass into the box."></svg><canvas aria-hidden="true"></canvas><svg class="iso-svg vp-front" viewBox="0 0 960 640" aria-hidden="true"></svg></div>`;

const plate = k.plateHtml({
  fig: "Fig 13",
  title: "60 carcasses → 1 VPH box",
  hint: "Drag to orbit · click a carcass or piece",
  readout: "animal 0 of 60 · 0 kg",
  keys: [
    { mark: "raised", label: "Meat piece: drawn area ∝ mass (50–1,000 g)" },
    { mark: "red", label: "Piece or carcass of contaminated origin" },
    { mark: "lit", label: "Selected carcass and its pieces" },
  ],
  caption: "Schematic. Pieces from each animal tumble into the box and pile up; the scale dial shows the mass landed so far. A red outline marks where a piece came from, not that it carries bacteria. Highlighted pieces are lifted to the top of the pile so they stay visible.",
  body: stage,
});

const body = `
<header>
  <p class="eyebrow">STEC in minced beef · contamination of raw material units</p>
  <h1>From 60 carcasses to one VPH box</h1>
  <p class="lede">A 1,000 kg VPH box combines meat contributions from 60 cattle. Only a few carcasses may contribute contamination, producing substantial differences in bacterial loads between boxes.</p>
</header>
<div class="vp-grid">
  <section class="vp-main">
    ${plate}
    <div class="vp-controls">
      <button type="button" data-act="play" aria-pressed="true">Pause</button>
      <button type="button" data-act="next">Next animal</button>
      <button type="button" data-act="fill">Fill box</button>
      <button type="button" data-act="reset">Reset</button>
      <label class="speed" for="vp-speed">Speed <input type="range" id="vp-speed" min="0.25" max="6" step="0.05" value="1.2"><span data-m="speed">1.20 animals/s</span></label>
      <button type="button" data-act="box">Next box</button>
    </div>
  </section>
  <aside class="vp-side">
    <div class="card">
      <h2>Display mode</h2>
      <fieldset class="modes">
        <legend class="hint">Choose what the box shows</legend>
        <label><input type="radio" name="vp-mode" value="physical" checked> Physical process <small>(schematic)</small></label>
        <label><input type="radio" name="vp-mode" value="explicit"> Explicitly simulated contributions</label>
      </fieldset>
      <p class="hint">The R model explicitly generates pieces only from contaminated carcasses. Contributions from other carcasses are implicit, while the total box mass is fixed at 1,000 kg.</p>
    </div>
    <div class="card">
      <h2>Progress</h2>
      <div class="meter"><div class="row"><span>Animals contributing</span><b data-m="animals">0 / 60</b></div><div class="track"><i data-b="animals"></i></div></div>
      <div class="meter"><div class="row"><span>Box filling <small>(schematic)</small></span><b><span data-m="fill">0 kg</span> / 1,000 kg</b></div><div class="track fill"><i data-b="fill"></i></div><small>Explicitly simulated: <span data-m="explicit">0 kg</span>. These are not rescaled to make the box total exactly 1,000 kg.</small></div>
      <div class="pair">
        <div><small>Expected organisms</small><span class="big" data-m="expected">0</span><small>sum of expected values, can be fractional</small></div>
        <div><small>Observed count</small><span class="big" data-m="observed">0</span><small>one Poisson draw per piece, integer, illustrative</small></div>
      </div>
      <p class="hint">Only pieces already in the box count. No bacterial growth during filling.</p>
    </div>
    <div class="card">
      <h2>Contaminated carcasses <small>(demonstration: 2 of 60)</small></h2>
      <ul class="list" data-m="carcasses"></ul>
      <p class="hint">Loads are illustrative organisms allocated to meat for mincing. The upstream steps that set them (faeces, hide, carcass surface, evisceration) are outside this view. Click a carcass to change its status or load.</p>
    </div>
    <div class="card vp-inspect" aria-live="polite"></div>
  </aside>
</div>
<section class="card archive">
  <h2>Boxes compared</h2>
  <ul class="vp-archive"></ul>
  <p class="hint">Each new box uses 60 new animal identifiers; one animal's pieces never go to two boxes here, because the R model does not track that allocation.</p>
</section>
<details class="tech">
  <summary>Technical details: what the R model computes</summary>
  <div data-m="tech">
  <ol>
    <li><b>Reference piece count.</b> Piece masses are drawn from a triangular distribution (minimum 50 g, mode 500 g, maximum 1,000 g; mean ≈ 517 g) until their cumulative mass reaches 1,000 kg (<code>rNotrm</code>). The number of pieces drawn, <code>Notrm</code>, is the reference count. It is drawn once per simulation run: here Notrm = {NOTRM}.</li>
    <li><b>Pieces per contaminated carcass.</b> For each contaminated carcass, the number of pieces is Poisson with mean Notrm / 60 = {LAMBDA} (about 32 pieces, about 16.7 kg per animal).</li>
    <li><b>Piece masses.</b> Each piece mass is drawn again from the same triangular distribution.</li>
    <li><b>Surface.</b> Each piece gets a surface-to-mass ratio uniform between 0.1 and 0.5 cm²/g; its surface area is mass × ratio.</li>
    <li><b>Expected organisms per piece</b> = carcass load allocated to beef for mincing × piece surface area / 32,000 cm² (the total carcass surface). Pieces from one carcass share its load but differ in mass and surface.</li>
    <li><b>Box total.</b> The expected organisms of all simulated pieces of the box are summed. These simulated contributions are not adjusted to sum to exactly 1,000 kg; the box mass stays 1,000 kg by definition, and meat from uncontaminated carcasses is never generated.</li>
  </ol>
  <p>The R script keeps expected (decimal) numbers. The integer "observed count" shown here is one Poisson draw per piece, added only to show the difference between an expected number and a count you could observe; it is not part of the R output.</p>
  <p>The 3.9% faecal shedding prevalence used upstream is not the carcass contamination prevalence. In the R model the number of contaminated carcasses per box is a binomial draw whose probability comes from the hide-transfer and evisceration equations; the two contaminated carcasses shown here are a demonstration setting.</p>
  <p>In the physical view, uncontaminated animals also drop Poisson(Notrm/60) pieces so the box looks full. That part is schematic: the R model does not create those pieces, and the drawn total is close to, but not exactly, 1,000 kg.</p>
  </div>
</details>
<p class="note">This is a simplified visualization of the R model. It does not track the allocation of other meat from the same animal to additional boxes.</p>
`;

// Standalone page for docs/: follows the reader's light or dark theme.
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>VPH Box Filling</title>
<style>${TOKENS}${rest}${CSS}</style>
</head>
<body>
<main class="iso vp">${body}</main>
<script type="module">${(kitScript() + src("model.mjs") + src("live.js")).replace(/<\/(script)/gi, "<\\/$1")}</script>
</body>
</html>
`;
writeFileSync(join(HERE, "..", "docs", "vph-box-filling.html"), page);
console.log("wrote docs/vph-box-filling.html", (page.length / 1024).toFixed(0) + " KB");
