import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  freshSave, loadSave, upgradeCost, upgradePathCost, buyUpgrade, setUpgradeLevel,
  setCoins, setGems, vehicleLevelSum, vehicleMaxSum, MONEY_CAP, COIN_OVERFLOW_GUARD, PARTS, VEHICLES,
} from '../js/save.js';
import {
  defaultFeatures, clampSpeed, clampScale, applyFrame, setFreezeCoins,
  unlockAllVehicles, unlockAllStages, maxVehicle, maxAllVehicles, enforceRun, runCommand,
} from '../js/modmenu.js';

test('fresh save defaults', () => {
  const s = freshSave();
  assert.equal(s.coins, 0);
  assert.equal(s.gems, 0);
  assert.equal(s.unlocked.rustbucket, true);
  assert.equal(s.unlocked.voltling, false);
  assert.equal(s.upgrades.rustbucket.engine, 1); // parts default to level 1
  assert.equal(s.stages.countryside, true);
  assert.equal(s.stages.moon, false);
});

test('load fills missing keys and clamps', () => {
  const s = loadSave({ coins: -5, gems: 9e12, upgrades: { rustbucket: { engine: 999 } } });
  assert.equal(s.coins, COIN_OVERFLOW_GUARD); // negative coins -> overflow guard
  assert.equal(s.gems, MONEY_CAP);
  assert.equal(s.upgrades.rustbucket.engine, 20); // clamped to part max
  assert.equal(s.upgrades.rustbucket.tires, 1); // missing -> default
  assert.equal(s.unlocked.rustbucket, true);
});

test('upgrade cost formula: free below highest, else base*(L+1)^2', () => {
  assert.equal(upgradeCost('engine', 3, 5), 0); // below highest bought
  assert.equal(upgradeCost('engine', 5, 5), 600 * 36); // base 600, (5+1)^2
  assert.equal(upgradeCost('tires', 0, 0), 500 * 1);
  assert.equal(upgradePathCost('engine', 0, 3, 0), 600 * (1 + 4 + 9));
});

test('buyUpgrade deducts coins, raises level and highest', () => {
  const s = freshSave();
  setCoins(s, 10_000);
  const before = s.coins;
  const r = buyUpgrade(s, 'rustbucket', 'engine'); // level 1 -> 2, cost 600*(2^2)=2400
  assert.equal(r.ok, true);
  assert.equal(r.level, 2);
  assert.equal(r.cost, 600 * 4);
  assert.equal(s.coins, before - 600 * 4);
  assert.equal(s.highest.rustbucket.engine, 2);
});

test('buyUpgrade refuses when broke or maxed', () => {
  const s = freshSave();
  setCoins(s, 0);
  assert.equal(buyUpgrade(s, 'rustbucket', 'engine').ok, false);
  setUpgradeLevel(s, 'rustbucket', 'engine', 20);
  setCoins(s, MONEY_CAP);
  assert.equal(buyUpgrade(s, 'rustbucket', 'engine').reason, 'max level');
});

test('setUpgradeLevel keeps highest so re-buying is free', () => {
  const s = freshSave();
  setUpgradeLevel(s, 'rustbucket', 'engine', 15);
  assert.equal(s.highest.rustbucket.engine, 15);
  setUpgradeLevel(s, 'rustbucket', 'engine', 3); // lower it back down
  assert.equal(s.upgrades.rustbucket.engine, 3);
  assert.equal(upgradeCost('engine', 3, s.highest.rustbucket.engine), 0); // free again
});

test('vehicle level sums', () => {
  const s = freshSave();
  assert.equal(vehicleLevelSum(s, 'rustbucket'), PARTS.length * 1);
  assert.equal(vehicleMaxSum(), PARTS.reduce((n, p) => n + p.max, 0));
});

test('clamp helpers', () => {
  assert.equal(clampSpeed(9), 4);
  assert.equal(clampSpeed(0), 0.1);
  assert.equal(clampSpeed(NaN), 1);
  assert.equal(clampScale(5), 3);
  assert.equal(clampScale(-1), 0);
});

test('freeze restores spent money on the next frame', () => {
  const s = freshSave();
  const f = defaultFeatures();
  setCoins(s, 1000);
  setFreezeCoins(s, f, true);
  setCoins(s, 10);
  applyFrame(s, f);
  assert.equal(s.coins, 1000);
});

test('keepUnlocked unlocks everything each frame', () => {
  const s = freshSave();
  const f = defaultFeatures();
  f.keepUnlocked = true;
  applyFrame(s, f);
  assert.equal(unlockAllVehicles(s), 0); // already all unlocked
  assert.equal(unlockAllStages(s), 0);
});

test('unlock / max helpers', () => {
  const s = freshSave();
  assert.equal(unlockAllVehicles(s), VEHICLES.length - 1);
  assert.equal(unlockAllVehicles(s), 0);
  assert.equal(maxVehicle(s, 'rustbucket'), PARTS.length);
  assert.equal(vehicleLevelSum(s, 'rustbucket'), vehicleMaxSum());
  assert.ok(maxAllVehicles(s) >= 0);
});

test('infinite fuel + no-crash enforcement', () => {
  const f = defaultFeatures();
  f.infiniteFuel = true;
  f.noCrash = true;
  const run = { fuel: 10, fuelMax: 100, crashed: true };
  enforceRun(run, f);
  assert.equal(run.fuel, 100);
  assert.equal(run.crashed, false);
});

test('command parser: economy, upgrades, toggles', () => {
  const s = freshSave();
  const f = defaultFeatures();
  const ctx = { save: s, features: f, run: { fuel: 5, fuelMax: 50, crashed: false } };
  assert.equal(runCommand(ctx, 'ping').message, 'pong');
  assert.equal(runCommand(ctx, 'SET COINS 5000').ok, true);
  assert.equal(s.coins, 5000);
  assert.equal(runCommand(ctx, 'add gems 10').ok, true);
  assert.equal(s.gems, 10);
  assert.equal(runCommand(ctx, 'set coins lots').ok, false);

  runCommand(ctx, 'freeze coins on');
  setCoins(s, 1);
  applyFrame(s, f);
  assert.equal(s.coins, 5000); // frozen

  assert.equal(runCommand(ctx, 'unlock vehicles').ok, true);
  assert.equal(runCommand(ctx, 'set upgrade 0 engine 12').ok, true);
  assert.equal(s.upgrades.rustbucket.engine, 12);
  assert.equal(runCommand(ctx, 'max upgrades current').ok, true);

  assert.equal(runCommand(ctx, 'speed 9').ok, true);
  assert.equal(f.gameSpeed, 4);
  assert.equal(runCommand(ctx, 'fuel infinite on').ok, true);
  assert.equal(f.infiniteFuel, true);
  assert.equal(runCommand(ctx, 'fuel refill').ok, true);
  assert.equal(ctx.run.fuel, 50);
  assert.equal(runCommand(ctx, 'nocrash on').ok, true);
  assert.equal(runCommand(ctx, 'menu toggle').ok, true);
  assert.equal(f.menuOpen, true);

  assert.equal(runCommand(ctx, 'fly to the moon').ok, false);
});
