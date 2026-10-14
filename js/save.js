// Save model for the clean-room browser game.
//
// This is ORIGINAL code. It reproduces only the *observed behaviour* of how an
// upgrade-driven hill-climbing game keeps its numbers (defaults, a square-growth
// upgrade cost, a coin clamp) - no game code, assets or data were copied.
//
// Shared by the browser (loaded as a module) and the node --test suite.

export const MONEY_CAP = 2_000_000_000; // keep headroom below 2^31-1
export const COIN_OVERFLOW_GUARD = 2_147_483_647; // observed: a negative coin total is pinned here

// The vehicles and their upgrade "parts". Names and flavour are our own.
export const VEHICLES = [
  { id: 'rustbucket', name: 'Rust Bucket', base: 0, blurb: 'Where everyone starts. Loud, slow, loveable.' },
  { id: 'dunehopper', name: 'Dune Hopper', base: 8_000, blurb: 'Light buggy that loves the sand.' },
  { id: 'tractary', name: 'Tractary', base: 25_000, blurb: 'Huge tank, tiny speed, enormous grip.' },
  { id: 'voltling', name: 'Voltling', base: 60_000, blurb: 'Electric. Charges while it coasts downhill.' },
  { id: 'magmarig', name: 'Magma Rig', base: 150_000, blurb: 'Drinks fuel, climbs anything.' },
  { id: 'skysleigh', name: 'Sky Sleigh', base: 400_000, blurb: 'Festive, floaty, faintly ridiculous.' },
];

export const PARTS = [
  { id: 'engine', name: 'Engine', base: 600, max: 20, blurb: 'More torque on the hills.' },
  { id: 'suspension', name: 'Suspension', base: 750, max: 20, blurb: 'Softer landings, fewer flips.' },
  { id: 'tires', name: 'Tires', base: 500, max: 20, blurb: 'Grip on loose ground.' },
  { id: 'fuel', name: 'Fuel Tank', base: 450, max: 20, blurb: 'Drive further before refuelling.' },
  { id: 'downforce', name: 'Downforce', base: 900, max: 20, blurb: 'Keeps the nose down at speed.' },
];

export const STAGES = [
  { id: 'countryside', name: 'Countryside', base: 0, blurb: 'Gentle green hills.' },
  { id: 'desert', name: 'Desert', base: 2_000, blurb: 'Long dunes, low grip.' },
  { id: 'arctic', name: 'Arctic', base: 10_000, blurb: 'Ice everywhere. Good luck.' },
  { id: 'canyon', name: 'Canyon', base: 30_000, blurb: 'Steep walls and big gaps.' },
  { id: 'moon', name: 'Moon', base: 90_000, blurb: 'Low gravity, huge air.' },
  { id: 'rainbow', name: 'Rainbow Road', base: 250_000, blurb: 'Colourful and unforgiving.' },
];

export const DEFAULT_PART_LEVEL = 1; // observed: upgrade levels default to 1, not 0

function clampCoins(v) {
  if (!Number.isFinite(v)) return 0;
  v = Math.trunc(v);
  if (v < 0) return COIN_OVERFLOW_GUARD; // observed overflow-guard behaviour
  return Math.min(v, MONEY_CAP);
}

function clampGems(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.min(Math.max(0, Math.trunc(v)), MONEY_CAP);
}

// A brand-new save. Every vehicle locked except the first; every part at level 1.
export function freshSave() {
  const upgrades = {};
  const highest = {};
  const unlocked = {};
  const stages = {};
  for (const v of VEHICLES) {
    unlocked[v.id] = v.id === 'rustbucket'; // only the starter is unlocked
    upgrades[v.id] = {};
    highest[v.id] = {};
    for (const p of PARTS) {
      upgrades[v.id][p.id] = DEFAULT_PART_LEVEL;
      highest[v.id][p.id] = DEFAULT_PART_LEVEL;
    }
  }
  for (const st of STAGES) stages[st.id] = st.id === 'countryside'; // only the first stage
  return {
    coins: 0,
    gems: 0,
    highscore: 0,
    car_selection: 0,
    stage_selection: 0,
    sound: true,
    music: true,
    unlocked,
    stages,
    upgrades,
    highest, // the highest level ever bought per part (re-buying below it is free)
  };
}

// Load from a plain object (e.g. localStorage), filling anything missing with defaults.
// Mirrors the game's "missing key -> default" loading rule.
export function loadSave(raw) {
  const s = freshSave();
  if (!raw || typeof raw !== 'object') return s;
  s.coins = clampCoins(raw.coins ?? 0);
  s.gems = clampGems(raw.gems ?? 0);
  s.highscore = Math.max(0, Math.trunc(raw.highscore ?? 0) || 0);
  s.car_selection = Math.trunc(raw.car_selection ?? 0) || 0;
  s.stage_selection = Math.trunc(raw.stage_selection ?? 0) || 0;
  s.sound = raw.sound !== false;
  s.music = raw.music !== false;
  for (const v of VEHICLES) {
    s.unlocked[v.id] = v.id === 'rustbucket' ? true : Boolean(raw.unlocked?.[v.id]);
    for (const p of PARTS) {
      const lvl = Math.trunc(raw.upgrades?.[v.id]?.[p.id]);
      s.upgrades[v.id][p.id] = Number.isFinite(lvl) ? Math.max(0, Math.min(lvl, p.max)) : DEFAULT_PART_LEVEL;
      const hi = Math.trunc(raw.highest?.[v.id]?.[p.id]);
      s.highest[v.id][p.id] = Number.isFinite(hi)
        ? Math.max(s.upgrades[v.id][p.id], Math.min(hi, p.max))
        : s.upgrades[v.id][p.id];
    }
  }
  for (const st of STAGES) s.stages[st.id] = st.id === 'countryside' ? true : Boolean(raw.stages?.[st.id]);
  return s;
}

export function partDef(partId) {
  return PARTS.find((p) => p.id === partId);
}
export function vehicleDef(id) {
  return VEHICLES.find((v) => v.id === id);
}

// Observed upgrade-cost rule: re-buying a level you already owned is free,
// otherwise the next level costs base * (level + 1)^2.
export function upgradeCost(partId, level, highestBought) {
  const p = partDef(partId);
  if (!p) return 0;
  if (level < highestBought) return 0;
  const next = level + 1;
  return p.base * next * next;
}

// Total coins to take a part from its current level to `target` (sum of each step).
export function upgradePathCost(partId, fromLevel, target, highestBought) {
  let total = 0;
  for (let l = fromLevel; l < target; l++) total += upgradeCost(partId, l, highestBought);
  return total;
}

export const clamp = { coins: clampCoins, gems: clampGems };

// ----- mutations used by both the game and the mod menu (pure, return info) -----

export function setCoins(save, value) {
  save.coins = clampCoins(value);
  return save.coins;
}
export function setGems(save, value) {
  save.gems = clampGems(value);
  return save.gems;
}
export function addCoins(save, delta) {
  return setCoins(save, save.coins + Math.trunc(delta));
}

// Try to buy one level of a part using coins. Returns {ok, cost, level}.
export function buyUpgrade(save, vehicleId, partId) {
  const p = partDef(partId);
  const level = save.upgrades[vehicleId]?.[partId];
  if (p == null || level == null) return { ok: false, reason: 'no such part' };
  if (level >= p.max) return { ok: false, reason: 'max level', level };
  const cost = upgradeCost(partId, level, save.highest[vehicleId][partId]);
  if (save.coins < cost) return { ok: false, reason: 'not enough coins', cost, level };
  save.coins = clampCoins(save.coins - cost);
  const next = level + 1;
  save.upgrades[vehicleId][partId] = next;
  save.highest[vehicleId][partId] = Math.max(save.highest[vehicleId][partId], next);
  return { ok: true, cost, level: next };
}

// Directly set a level (mod menu). Keeps the "highest ever bought" so re-buying stays free.
export function setUpgradeLevel(save, vehicleId, partId, level) {
  const p = partDef(partId);
  if (!p || !save.upgrades[vehicleId]) return false;
  const lvl = Math.max(0, Math.min(Math.trunc(level), p.max));
  save.upgrades[vehicleId][partId] = lvl;
  save.highest[vehicleId][partId] = Math.max(save.highest[vehicleId][partId] ?? 0, lvl);
  return true;
}

export function vehicleLevelSum(save, vehicleId) {
  return PARTS.reduce((n, p) => n + (save.upgrades[vehicleId]?.[p.id] ?? 0), 0);
}
export function vehicleMaxSum() {
  return PARTS.reduce((n, p) => n + p.max, 0);
}
