// Mod-menu logic for the clean-room browser game: feature flags, the actions they drive,
// and a small text-command parser (mirrors the in-game menu's command surface so the same
// behaviour can be unit-tested). Pure logic - no DOM, no canvas.

import {
  VEHICLES, PARTS, STAGES, MONEY_CAP,
  setCoins, setGems, addCoins, setUpgradeLevel, vehicleLevelSum, vehicleMaxSum, partDef,
} from './save.js';

export function defaultFeatures() {
  return {
    menuOpen: false,
    freezeCoins: false,
    freezeGems: false,
    frozenCoins: 0,
    frozenGems: 0,
    infiniteFuel: false,
    keepUnlocked: false,
    gameSpeed: 1,
    // physics toys (browser only)
    gravityScale: 1,
    torqueScale: 1,
    noCrash: false,
    // cosmetic
    accent: 0,
    showHud: true,
  };
}

export function clampSpeed(s) {
  if (!Number.isFinite(s)) return 1;
  return Math.max(0.1, Math.min(s, 4));
}
export function clampScale(s) {
  if (!Number.isFinite(s)) return 1;
  return Math.max(0, Math.min(s, 3));
}

// Called every frame (or tick) to enforce the "freeze/keep" toggles.
export function applyFrame(save, features) {
  if (features.freezeCoins && save.coins !== features.frozenCoins) setCoins(save, features.frozenCoins);
  if (features.freezeGems && save.gems !== features.frozenGems) setGems(save, features.frozenGems);
  if (features.keepUnlocked) {
    for (const v of VEHICLES) save.unlocked[v.id] = true;
    for (const st of STAGES) save.stages[st.id] = true;
  }
}

export function setFreezeCoins(save, features, on) {
  features.freezeCoins = on;
  features.frozenCoins = save.coins;
}
export function setFreezeGems(save, features, on) {
  features.freezeGems = on;
  features.frozenGems = save.gems;
}

export function unlockAllVehicles(save) {
  let n = 0;
  for (const v of VEHICLES) if (!save.unlocked[v.id]) { save.unlocked[v.id] = true; n++; }
  return n;
}
export function unlockAllStages(save) {
  let n = 0;
  for (const st of STAGES) if (!save.stages[st.id]) { save.stages[st.id] = true; n++; }
  return n;
}
export function maxVehicle(save, vehicleId) {
  let n = 0;
  for (const p of PARTS) if (save.upgrades[vehicleId][p.id] !== p.max) { setUpgradeLevel(save, vehicleId, p.id, p.max); n++; }
  return n;
}
export function resetVehicle(save, vehicleId, level = 1) {
  for (const p of PARTS) setUpgradeLevel(save, vehicleId, p.id, level);
}
export function maxAllVehicles(save) {
  let n = 0;
  for (const v of VEHICLES) n += maxVehicle(save, v.id);
  return n;
}

// A run in progress (fuel, distance, coins-this-run). The game creates/clears it.
export function enforceRun(run, features) {
  if (!run) return;
  if (features.infiniteFuel && run.fuelMax > 0) run.fuel = run.fuelMax;
  if (features.noCrash) run.crashed = false;
}

// ---- text commands (same vocabulary as the native in-game menu) ----
function num(tok) {
  const n = Number(tok);
  return Number.isFinite(n) ? n : null;
}
function onoff(tok) {
  if (['on', '1', 'true', 'yes'].includes(tok)) return true;
  if (['off', '0', 'false', 'no'].includes(tok)) return false;
  return null;
}

export function runCommand(ctx, line) {
  const { save, features } = ctx;
  const run = ctx.run ?? null;
  const w = String(line).trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!w.length) return { ok: false, message: 'empty command' };
  const ok = (m) => ({ ok: true, message: m });
  const err = (m) => ({ ok: false, message: m });

  switch (w[0]) {
    case 'ping': return ok('pong');
    case 'help': return ok(commandHelp());
    case 'set':
    case 'add': {
      if ((w[1] === 'coins' || w[1] === 'gems') && w[2] != null) {
        const n = num(w[2]);
        if (n == null) return err('not a number: ' + w[2]);
        const coins = w[1] === 'coins';
        const cur = coins ? save.coins : save.gems;
        const target = w[0] === 'set' ? n : cur + n;
        const v = coins ? setCoins(save, target) : setGems(save, target);
        if (coins && features.freezeCoins) features.frozenCoins = v;
        if (!coins && features.freezeGems) features.frozenGems = v;
        return ok(`${w[1]} = ${v}`);
      }
      if (w[1] === 'upgrade' && w.length === 5) {
        const vi = num(w[2]), lvl = num(w[4]);
        if (vi == null || lvl == null) return err('bad numbers');
        const v = VEHICLES[vi];
        const p = partDef(w[3]);
        if (!v || !p) return err('no such vehicle/part');
        setUpgradeLevel(save, v.id, p.id, lvl);
        return ok(`${v.name} ${p.name} = ${save.upgrades[v.id][p.id]}`);
      }
      if (w[1] === 'speed' && w[2] != null) { features.gameSpeed = clampSpeed(num(w[2])); return ok('speed ' + features.gameSpeed); }
      if (w[1] === 'gravity' && w[2] != null) { features.gravityScale = clampScale(num(w[2])); return ok('gravity ' + features.gravityScale); }
      return err('bad set/add command');
    }
    case 'freeze': {
      const v = onoff(w[2]);
      if (v == null) return err('freeze coins|gems on|off');
      if (w[1] === 'coins') { setFreezeCoins(save, features, v); return ok('freeze coins ' + (v ? 'on' : 'off')); }
      if (w[1] === 'gems') { setFreezeGems(save, features, v); return ok('freeze gems ' + (v ? 'on' : 'off')); }
      return err('freeze coins|gems on|off');
    }
    case 'unlock':
      if (w[1] === 'vehicles') return ok('unlocked vehicles: ' + unlockAllVehicles(save));
      if (w[1] === 'stages') return ok('unlocked stages: ' + unlockAllStages(save));
      return err('unlock vehicles|stages');
    case 'max':
      if (w[1] === 'upgrades' && w[2] === 'all') return ok('maxed parts: ' + maxAllVehicles(save));
      if (w[1] === 'upgrades' && w[2] === 'current') return ok('maxed: ' + maxVehicle(save, VEHICLES[save.car_selection].id));
      return err('max upgrades all|current');
    case 'speed': { const n = num(w[1]); if (n == null) return err('speed X'); features.gameSpeed = clampSpeed(n); return ok('speed ' + features.gameSpeed); }
    case 'fuel':
      if (w[1] === 'infinite') { const v = onoff(w[2]); if (v == null) return err('fuel infinite on|off'); features.infiniteFuel = v; return ok('infinite fuel ' + (v ? 'on' : 'off')); }
      if (w[1] === 'refill') { if (!run) return err('not driving'); run.fuel = run.fuelMax; return ok('refilled'); }
      return err('fuel infinite on|off | fuel refill');
    case 'nocrash': { const v = onoff(w[1]); if (v == null) return err('nocrash on|off'); features.noCrash = v; return ok('no-crash ' + (v ? 'on' : 'off')); }
    case 'menu':
      if (w[1] === 'open') features.menuOpen = true;
      else if (w[1] === 'close') features.menuOpen = false;
      else if (w[1] === 'toggle') features.menuOpen = !features.menuOpen;
      else return err('menu open|close|toggle');
      return ok(features.menuOpen ? 'menu open' : 'menu closed');
    default:
      return err('unknown command: ' + line);
  }
}

export function commandHelp() {
  return [
    'ping',
    'set|add coins|gems N',
    'set upgrade <vehicleIndex> <part> <level>',
    'freeze coins|gems on|off',
    'unlock vehicles|stages',
    'max upgrades all|current',
    'speed X   (0.1 - 4)',
    'set gravity X   (0 - 3)',
    'fuel infinite on|off | fuel refill',
    'nocrash on|off',
    'menu open|close|toggle',
  ].join('\n');
}

export { vehicleLevelSum, vehicleMaxSum, MONEY_CAP };
