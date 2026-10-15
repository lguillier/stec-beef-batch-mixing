// Port of the piece-generation step of generate_vph_contamination.R (VPH3 model).
// Upstream carcass loads (faeces → hide → carcass, evisceration) are NOT modelled here:
// the load of each contaminated carcass is an illustrative input.

export const ANIMALS = 60; // n
export const BOX_G = 1e6; // tailleVPH, g
export const TRI = { a: 50, mode: 500, b: 1000 }; // rtriangle(…, 50, 1000, 500), g
export const SA_RATIO = [0.1, 0.5]; // cm² per g
export const TSA = 32000; // total carcass surface, cm²
export const AREA_PER_G = 0.2; // drawn footprint, cm² per g (schematic)

// Small seeded generator so a box is reproducible.
export function rngOf(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Same inverse transform as the R rtriangle(n, a, b, c).
export function rtriangle(u, a = TRI.a, b = TRI.b, c = TRI.mode) {
  return u < (c - a) / (b - a) ? a + Math.sqrt(u * (b - a) * (c - a)) : b - Math.sqrt((1 - u) * (b - a) * (b - c));
}

export const MEAN_PIECE = (TRI.a + TRI.mode + TRI.b) / 3; // ≈ 516.7 g

// rNotrm(): draw piece masses until their sum reaches the box mass; the count is the reference.
export function referenceCount(rng) {
  let w = 0;
  let n = 0;
  while (w < BOX_G) {
    w += rtriangle(rng());
    n += 1;
  }
  return n;
}

// Poisson quantile for a given uniform, so a piece keeps its draw when the load changes.
const probit = (p) => {
  // Acklam's approximation
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = Math.min(1 - 1e-12, Math.max(1e-12, p));
  if (q < 0.02425) {
    const r = Math.sqrt(-2 * Math.log(q));
    return (((((c[0] * r + c[1]) * r + c[2]) * r + c[3]) * r + c[4]) * r + c[5]) / ((((d[0] * r + d[1]) * r + d[2]) * r + d[3]) * r + 1);
  }
  if (q > 1 - 0.02425) return -probit(1 - q);
  const r = q - 0.5;
  const s = r * r;
  return ((((((a[0] * s + a[1]) * s + a[2]) * s + a[3]) * s + a[4]) * s + a[5]) * r) / (((((b[0] * s + b[1]) * s + b[2]) * s + b[3]) * s + b[4]) * s + 1);
};
export function poissonAt(u, lambda) {
  if (!(lambda > 0)) return 0;
  if (lambda > 400) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * probit(u)));
  let k = 0;
  let p = Math.exp(-lambda);
  let cdf = p;
  while (u > cdf && k < 10000) {
    k += 1;
    p *= lambda / k;
    cdf += p;
  }
  return k;
}

// One box: 60 new animal ids; every animal gets Poisson(Notrm/60) pieces so the physical
// view can be drawn, but only contaminated carcasses' pieces are "explicit" (as in R).
export function makeBox(index, notrm, seed, contaminated) {
  const rng = rngOf(seed);
  const lambda = notrm / ANIMALS;
  const first = index * ANIMALS + 1;
  const animals = [];
  const pieces = [];
  for (let a = 0; a < ANIMALS; a++) {
    const id = first + a;
    const count = poissonAt(rng(), lambda);
    const list = [];
    for (let j = 0; j < count; j++) {
      const mass = rtriangle(rng());
      const ratio = SA_RATIO[0] + (SA_RATIO[1] - SA_RATIO[0]) * rng();
      const piece = {
        key: `${id}-${j + 1}`,
        animal: id,
        slot: a,
        n: j,
        mass, // g
        ratio, // cm²/g
        area: mass * ratio, // surface, cm²
        uObs: rng(), // fixed uniform for the illustrative observed count
        shape: Array.from({ length: 9 }, () => rng()),
        spin: rng(),
        land: [rng(), rng(), rng()],
      };
      list.push(piece);
      pieces.push(piece);
    }
    animals.push({ id, slot: a, pieces: list });
  }
  const load = new Map(contaminated);
  return { index, first, lambda, animals, pieces, load };
}

// Expected organisms on a piece = carcass load allocated to mincing beef × SA / TSA.
export const expectedOf = (piece, load) => (load ? (load * piece.area) / TSA : 0);
export const observedOf = (piece, load) => poissonAt(piece.uObs, expectedOf(piece, load));

export function totalsOf(box, landed = Infinity) {
  let mass = 0, explicitMass = 0, expected = 0, observed = 0, explicitPieces = 0;
  box.pieces.forEach((p, i) => {
    if (i >= landed) return;
    mass += p.mass;
    const load = box.load.get(p.animal);
    if (load !== undefined) {
      explicitMass += p.mass;
      explicitPieces += 1;
      expected += expectedOf(p, load);
      observed += observedOf(p, load);
    }
  });
  return { mass, explicitMass, expected, observed, explicitPieces };
}

export const fmt = (x, digits = 1) => {
  if (x === 0) return "0";
  if (Math.abs(x) >= 1e5) return x.toExponential(2).replace("e+", "×10^");
  if (Math.abs(x) >= 100) return Math.round(x).toLocaleString("en-US");
  if (Math.abs(x) >= 1) return x.toFixed(digits);
  return x.toPrecision(2);
};
