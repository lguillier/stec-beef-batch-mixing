// Batch-mixing model after ANSES opinion 2016-SA-0121, section 3.4.6 and Figure 12.
// Every batch (mêlée) is 1000 kg: 60 % chilled fatty (R-G), 30 % chilled lean (R-M) and
// 10 % frozen (C) raw material units (VPH) of 1000 kg each, drawn first-in first-out,
// plus a carry-over of 1/1000 of the previous batch's mass left in the mixer.

export const BATCHES = 8;
export const BATCH_KG = 1000;
export const UNIT_KG = 1000;
export const CARRY = 0.001;

export const TYPES = [
  { key: "G", code: "R-G", name: "chilled fatty", share: 0.6 },
  { key: "M", code: "R-M", name: "chilled lean", share: 0.3 },
  { key: "C", code: "C", name: "frozen", share: 0.1 },
];

const kgOfType = (type) => type.share * BATCH_KG;

// How many units of each type the eight batches open (the last one may be part-used).
export const UNITS = TYPES.map((type) => ({
  type: type.key,
  count: Math.ceil((kgOfType(type) * BATCHES) / UNIT_KG - 1e-9),
}));

// Mass of each unit taken into each batch: alloc[n][`${type}${i}`] = kg.
function allocate() {
  const out = Array.from({ length: BATCHES }, () => ({}));
  for (const type of TYPES) {
    let unit = 1;
    let left = UNIT_KG;
    for (let n = 0; n < BATCHES; n++) {
      let need = kgOfType(type);
      while (need > 1e-9) {
        const take = Math.min(need, left);
        const id = `${type.key}${unit}`;
        out[n][id] = (out[n][id] ?? 0) + take;
        need -= take;
        left -= take;
        if (left <= 1e-9) {
          unit += 1;
          left = UNIT_KG;
        }
      }
    }
  }
  return out;
}

export const ALLOC = allocate();

// The ids of every unit, in lane order.
export const UNIT_IDS = UNITS.flatMap(({ type, count }) => Array.from({ length: count }, (_, i) => `${type}${i + 1}`));

// The batches a unit goes into.
export const batchesOf = (id) => ALLOC.map((parts, n) => (parts[id] ? n : -1)).filter((n) => n >= 0);

// Fractions of batch n by source: units, plus "carry" from batch n - 1.
export function recipeOf(n) {
  const carryKg = n > 0 ? CARRY * BATCH_KG : 0;
  const total = BATCH_KG + carryKg;
  const parts = Object.entries(ALLOC[n]).map(([id, kg]) => ({ id, kg, share: kg / total }));
  if (carryKg) parts.push({ id: "carry", kg: carryKg, share: carryKg / total, from: n - 1 });
  return parts;
}

// Contamination of each batch relative to a contaminated unit's own level, given the set
// of contaminated unit ids: level_n = Σ share_u·c_u + share_carry·level_(n−1).
export function levelsOf(contaminated) {
  const levels = [];
  for (let n = 0; n < BATCHES; n++) {
    let level = 0;
    for (const part of recipeOf(n)) {
      if (part.id === "carry") level += part.share * levels[n - 1];
      else if (contaminated.has(part.id)) level += part.share;
    }
    levels.push(level);
  }
  return levels;
}

// Remaining kg of every unit after `t` batches (t continuous in 0..BATCHES).
export function remainingAt(t) {
  const out = {};
  for (const type of TYPES) {
    const drawn = kgOfType(type) * Math.max(0, Math.min(BATCHES, t));
    const { count } = UNITS.find((u) => u.type === type.key);
    for (let i = 0; i < count; i++) out[`${type.key}${i + 1}`] = Math.max(0, Math.min(UNIT_KG, UNIT_KG * (i + 1) - drawn));
  }
  return out;
}

// The moment (in batches) unit i of a type runs out.
export const emptyAt = (id) => {
  const type = TYPES.find((t) => t.key === id[0]);
  const i = Number(id.slice(1));
  return (UNIT_KG * i) / kgOfType(type);
};

// The unit of a type being drawn at time t (null after the last batch).
export function activeAt(typeKey, t) {
  if (t >= BATCHES) return null;
  const type = TYPES.find((x) => x.key === typeKey);
  return `${typeKey}${Math.floor((kgOfType(type) * Math.max(0, t)) / UNIT_KG + 1e-9) + 1}`;
}

const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
export const pct = (share) => {
  const value = share * 100;
  if (value === 0) return "0%";
  if (value >= 1) return `${Number.isInteger(Math.round(value * 10) / 10) ? Math.round(value) : value.toFixed(1)}%`;
  if (value >= 0.001) return `${Number(value.toPrecision(2))}%`;
  const exp = Math.floor(Math.log10(value));
  const mant = Math.round(value / 10 ** exp);
  return `${mant}·10${String(exp).split("").map((c) => SUP[c]).join("")}%`;
};
