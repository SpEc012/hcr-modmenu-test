// Main game: screens, driving loop, rendering and persistence. Original clean-room code.
import {
  freshSave, loadSave, VEHICLES, PARTS, STAGES, vehicleDef, partDef,
  buyUpgrade, upgradeCost, vehicleLevelSum, vehicleMaxSum,
} from './save.js';
import { defaultFeatures, applyFrame, enforceRun } from './modmenu.js';
import { makeTerrain, STAGE_PROFILES } from './terrain.js';
import { makeCar, carStats, step } from './physics.js';
import { buildModMenu } from './ui.js';

const SAVE_KEY = 'hcr-modmenu-test-save';
const FIXED_DT = 1 / 120;

export const App = {
  save: null,
  features: defaultFeatures(),
  screen: 'home',
  canvas: null,
  ctx: null,
  // driving state
  terrain: null,
  car: null,
  stats: null,
  pickups: [],
  run: null,
  input: { throttle: 0, left: false, right: false },
  acc: 0,
  last: 0,
  result: null,
};

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return loadSave(raw ? JSON.parse(raw) : null);
  } catch {
    return freshSave();
  }
}
export function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(App.save)); } catch { /* private mode */ }
}

export function boot() {
  if (typeof window !== 'undefined') window.__HD = App; // debug handle
  App.save = loadFromStorage();
  App.canvas = document.getElementById('game');
  App.ctx = App.canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
  wireInput();
  buildModMenu(App, { persist, renderScreens });
  renderScreens();
  App.last = performance.now();
  requestAnimationFrame(frame);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = App.canvas.clientWidth, h = App.canvas.clientHeight;
  App.canvas.width = Math.floor(w * dpr);
  App.canvas.height = Math.floor(h * dpr);
  App.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// -------------------------------------------------------------- screens (DOM)
const $ = (id) => document.getElementById(id);

export function renderScreens() {
  $('coinHud').textContent = fmt(App.save.coins);
  $('gemHud').textContent = fmt(App.save.gems);
  for (const el of document.querySelectorAll('.screen')) el.classList.toggle('active', el.id === 'screen-' + App.screen);
  if (App.screen === 'home') renderHome();
  if (App.screen === 'garage') renderGarage();
  if (App.screen === 'vehicles') renderVehicles();
  if (App.screen === 'stages') renderStages();
  $('gameWrap').classList.toggle('active', App.screen === 'drive');
}

function renderHome() {
  const v = VEHICLES[App.save.car_selection];
  const st = STAGES[App.save.stage_selection];
  $('homeVehicle').textContent = v.name;
  $('homeStage').textContent = st.name;
}

function card(html) { const d = document.createElement('div'); d.className = 'card'; d.innerHTML = html; return d; }

function renderVehicles() {
  const host = $('vehicleList');
  host.innerHTML = '';
  VEHICLES.forEach((v, i) => {
    const unlocked = App.save.unlocked[v.id];
    const sel = App.save.car_selection === i;
    const sum = vehicleLevelSum(App.save, v.id), max = vehicleMaxSum();
    const c = card(`
      <div class="card-top"><h3>${v.name}</h3>${sel ? '<span class="pill pill-accent">SELECTED</span>' : ''}</div>
      <p class="muted">${v.blurb}</p>
      <div class="bar"><span style="width:${(sum / max * 100).toFixed(0)}%"></span></div>
      <div class="row">
        ${unlocked
          ? `<button class="btn ${sel ? 'btn-ghost' : 'btn-accent'}" data-sel="${i}">${sel ? 'Selected' : 'Select'}</button>`
          : `<button class="btn btn-accent" data-buyv="${v.id}">Unlock · ${fmt(v.base)} 🪙</button>`}
        <button class="btn btn-ghost" data-gar="${i}">Garage</button>
      </div>`);
    host.appendChild(c);
  });
  host.querySelectorAll('[data-sel]').forEach((b) => b.onclick = () => { App.save.car_selection = +b.dataset.sel; persist(); renderScreens(); });
  host.querySelectorAll('[data-gar]').forEach((b) => b.onclick = () => { App.save.car_selection = +b.dataset.gar; App.screen = 'garage'; renderScreens(); });
  host.querySelectorAll('[data-buyv]').forEach((b) => b.onclick = () => {
    const v = vehicleDef(b.dataset.buyv);
    if (App.save.coins >= v.base) { App.save.coins -= v.base; App.save.unlocked[v.id] = true; toast(`Unlocked ${v.name}`); persist(); renderScreens(); }
    else toast('Not enough coins');
  });
}

function renderGarage() {
  const v = VEHICLES[App.save.car_selection];
  $('garageTitle').textContent = v.name;
  const host = $('garageParts');
  host.innerHTML = '';
  PARTS.forEach((p) => {
    const level = App.save.upgrades[v.id][p.id];
    const cost = upgradeCost(p.id, level, App.save.highest[v.id][p.id]);
    const maxed = level >= p.max;
    const c = card(`
      <div class="card-top"><h3>${p.name}</h3><span class="pill">Lv ${level}/${p.max}</span></div>
      <p class="muted">${p.blurb}</p>
      <div class="bar"><span style="width:${(level / p.max * 100).toFixed(0)}%"></span></div>
      <div class="row">
        <button class="btn btn-accent" data-buy="${p.id}" ${maxed || App.save.coins < cost ? 'disabled' : ''}>
          ${maxed ? 'MAX' : (cost === 0 ? 'Upgrade · free' : `Upgrade · ${fmt(cost)} 🪙`)}
        </button>
      </div>`);
    host.appendChild(c);
  });
  host.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => {
    const r = buyUpgrade(App.save, v.id, b.dataset.buy);
    toast(r.ok ? `Upgraded ${partDef(b.dataset.buy).name} to ${r.level}` : (r.reason || 'cannot upgrade'));
    persist(); renderScreens();
  });
}

function renderStages() {
  const host = $('stageList');
  host.innerHTML = '';
  STAGES.forEach((st, i) => {
    const unlocked = App.save.stages[st.id];
    const sel = App.save.stage_selection === i;
    const c = card(`
      <div class="card-top"><h3>${st.name}</h3>${sel ? '<span class="pill pill-accent">SELECTED</span>' : ''}</div>
      <p class="muted">${st.blurb}</p>
      <div class="row">
        ${unlocked
          ? `<button class="btn ${sel ? 'btn-ghost' : 'btn-accent'}" data-sel="${i}">${sel ? 'Selected' : 'Select'}</button>`
          : `<button class="btn btn-accent" data-buy="${st.id}">Unlock · ${fmt(st.base)} 🪙</button>`}
      </div>`);
    host.appendChild(c);
  });
  host.querySelectorAll('[data-sel]').forEach((b) => b.onclick = () => { App.save.stage_selection = +b.dataset.sel; persist(); renderScreens(); });
  host.querySelectorAll('[data-buy]').forEach((b) => b.onclick = () => {
    const st = STAGES.find((s) => s.id === b.dataset.buy);
    if (App.save.coins >= st.base) { App.save.coins -= st.base; App.save.stages[st.id] = true; toast(`Unlocked ${st.name}`); persist(); renderScreens(); }
    else toast('Not enough coins');
  });
}

// -------------------------------------------------------------- driving
export function startRun() {
  const stage = STAGES[App.save.stage_selection];
  App.terrain = makeTerrain(stage.id, STAGE_PROFILES[stage.id]);
  App.car = makeCar(App.terrain, App.terrain.start + 60);
  App.stats = carStats(App.save.upgrades[VEHICLES[App.save.car_selection].id], PARTS);
  App.car.fuel = 1;
  App.pickups = buildPickups(App.terrain, App.stats);
  App.run = { coins: 0, gems: 0, over: false };
  App.result = null;
  App.screen = 'drive';
  renderScreens();
  resize(); // the canvas was hidden until now, so (re)measure it
}

function buildPickups(terrain, stats) {
  const items = [];
  for (let x = terrain.start + 500; x < terrain.start + 60000; x += 220 + Math.random() * 120) {
    const r = Math.random();
    const kind = r < 0.08 ? 'gem' : r < 0.24 ? 'fuel' : 'coin';
    items.push({ x, y: terrain.height(x) - 34, kind, taken: false });
  }
  return items;
}

function endRun() {
  if (App.run.over) return;
  App.run.over = true;
  App.save.coins += App.run.coins;
  App.save.gems += App.run.gems;
  const dist = Math.floor(App.car.distance);
  if (dist > App.save.highscore) App.save.highscore = dist;
  App.result = { distance: dist, coins: App.run.coins, gems: App.run.gems, flips: App.car.flips, crashed: App.car.crashed };
  persist();
  App.screen = 'home';
  renderScreens();
  showResult(App.result);
}

function updateDriving(dt) {
  const f = App.features;
  App.input.throttle = (App.input.right ? 1 : 0) - (App.input.left ? 1 : 0);
  App.acc += dt * (f.gameSpeed || 1);
  let steps = 0;
  while (App.acc >= FIXED_DT && steps < 10) {
    step(App.car, App.terrain, App.stats, App.input, FIXED_DT, f);
    App.acc -= FIXED_DT;
    steps++;
  }
  // feature enforcement via the shared run proxy
  const proxy = { fuel: App.car.fuel, fuelMax: 1, crashed: App.car.crashed };
  enforceRun(proxy, f);
  App.car.fuel = proxy.fuel;
  App.car.crashed = proxy.crashed;

  // pickups
  for (const it of App.pickups) {
    if (it.taken) continue;
    if (Math.abs(it.x - App.car.x) < 30 && Math.abs(it.y - App.car.y) < 46) {
      it.taken = true;
      if (it.kind === 'coin') App.run.coins += 10;
      else if (it.kind === 'gem') App.run.gems += 1;
      else App.car.fuel = Math.min(1, App.car.fuel + 0.5);
    }
  }
  // end conditions
  if ((App.car.crashed && !f.noCrash) || (App.car.fuel <= 0 && Math.abs(App.car.vx) < 8 && !f.infiniteFuel)) {
    App.endTimer = (App.endTimer || 0) + dt;
    if (App.endTimer > 1.2) { App.endTimer = 0; endRun(); }
  } else {
    App.endTimer = 0;
  }
}

// -------------------------------------------------------------- rendering
function frame(now) {
  const dt = Math.min(0.05, (now - App.last) / 1000);
  App.last = now;
  applyFrame(App.save, App.features);
  if (App.screen === 'drive' && App.car) {
    if (App.canvas.width === 0 || App.canvas.height === 0) resize();
    updateDriving(dt);
    draw();
    drawHud();
  }
  // keep top-bar currency live when the mod menu changes it
  $('coinHud').textContent = fmt(App.save.coins);
  $('gemHud').textContent = fmt(App.save.gems);
  requestAnimationFrame(frame);
}

function draw() {
  const ctx = App.ctx, cvs = App.canvas;
  const W = cvs.clientWidth, H = cvs.clientHeight;
  const p = App.terrain.profile;
  const camX = App.car.x - W * 0.35;
  const camY = App.car.y - H * 0.55;

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, p.sky[0]);
  sky.addColorStop(1, p.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // terrain fill
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let sx = 0; sx <= W; sx += 6) {
    const wx = camX + sx;
    ctx.lineTo(sx, App.terrain.height(wx) - camY);
  }
  ctx.lineTo(W, H);
  ctx.closePath();
  const grd = ctx.createLinearGradient(0, H * 0.3, 0, H);
  grd.addColorStop(0, p.ground);
  grd.addColorStop(1, p.ground2);
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.25)';
  ctx.lineWidth = 3;
  ctx.stroke();

  // pickups
  for (const it of App.pickups) {
    if (it.taken) continue;
    const sx = it.x - camX, sy = it.y - camY;
    if (sx < -40 || sx > W + 40) continue;
    drawPickup(ctx, sx, sy, it.kind);
  }
  // car
  drawCar(ctx, App.car, camX, camY, p);
}

function drawPickup(ctx, x, y, kind) {
  ctx.save();
  ctx.translate(x, y);
  if (kind === 'coin') { ctx.fillStyle = '#ffcf3f'; ctx.strokeStyle = '#c9951a'; circle(ctx, 0, 0, 11); }
  else if (kind === 'gem') { ctx.fillStyle = '#7ad7ff'; ctx.strokeStyle = '#2b9fd6'; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(10, 0); ctx.lineTo(0, 12); ctx.lineTo(-10, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  else { ctx.fillStyle = '#e0473a'; ctx.strokeStyle = '#8f271e'; ctx.fillRect(-9, -12, 18, 24); ctx.strokeRect(-9, -12, 18, 24); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('F', 0, 4); }
  ctx.restore();
}

function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2; ctx.stroke(); }

function drawCar(ctx, car, camX, camY, p) {
  const sx = car.x - camX, sy = car.y - camY;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(car.angle);
  // wheels
  for (const dx of [-car.wheelBase, car.wheelBase]) {
    ctx.save();
    ctx.translate(dx, 0);
    ctx.fillStyle = '#222';
    ctx.strokeStyle = '#000';
    circle(ctx, 0, 0, car.wheelRadius);
    ctx.fillStyle = '#9aa';
    circle(ctx, 0, 0, car.wheelRadius * 0.45);
    ctx.restore();
  }
  // body
  ctx.fillStyle = car.crashed ? '#b33' : '#ff8a2a';
  ctx.strokeStyle = '#7a3c08';
  ctx.lineWidth = 2;
  roundRect(ctx, -car.wheelBase - 6, -34, car.wheelBase * 2 + 12, 30, 8);
  ctx.fill(); ctx.stroke();
  // cabin
  ctx.fillStyle = '#ffd08a';
  roundRect(ctx, -10, -30, 30, 18, 5);
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHud() {
  if (!App.features.showHud) { $('driveHud').style.display = 'none'; return; }
  $('driveHud').style.display = '';
  const car = App.car;
  $('hudDist').textContent = Math.floor(car.distance) + ' m';
  $('hudCoins').textContent = App.run.coins;
  $('hudGems').textContent = App.run.gems;
  $('hudFlips').textContent = car.flips;
  const pct = Math.max(0, Math.min(1, car.fuel)) * 100;
  const bar = $('hudFuelBar');
  bar.style.width = pct.toFixed(0) + '%';
  bar.style.background = pct < 25 ? '#e0473a' : 'var(--accent)';
  $('hudState').textContent = car.crashed ? 'CRASHED' : (App.features.infiniteFuel ? '∞ fuel' : '');
}

// -------------------------------------------------------------- input
function wireInput() {
  const down = (v) => { if (App.screen !== 'drive') return; if (v === 'L') App.input.left = true; else App.input.right = true; };
  const up = (v) => { if (v === 'L') App.input.left = false; else App.input.right = false; };
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.key === 'Insert' || e.key === 'F1') { e.preventDefault(); App.features.menuOpen = !App.features.menuOpen; document.dispatchEvent(new Event('modmenu:refresh')); return; }
    if (App.screen !== 'drive') return;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') down('R');
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') down('L');
    if (e.key === 'Escape') endRun();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') up('R');
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') up('L');
  });
  const gas = $('padRight'), brake = $('padLeft');
  const bind = (el, v) => {
    const on = (e) => { e.preventDefault(); down(v); };
    const off = (e) => { e.preventDefault(); up(v); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointerleave', off);
    el.addEventListener('pointercancel', off);
  };
  bind(gas, 'R');
  bind(brake, 'L');
}

// -------------------------------------------------------------- misc UI
export function toast(text) {
  const host = $('toasts');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  host.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
}

function showResult(r) {
  const m = $('resultModal');
  $('resultBody').innerHTML = `
    <div class="result-row"><span>Distance</span><b>${r.distance} m</b></div>
    <div class="result-row"><span>Coins</span><b>${r.coins} 🪙</b></div>
    <div class="result-row"><span>Gems</span><b>${r.gems} 💎</b></div>
    <div class="result-row"><span>Flips</span><b>${r.flips}</b></div>
    <div class="result-row"><span>Ended by</span><b>${r.crashed ? 'crash' : 'out of fuel'}</b></div>`;
  m.classList.add('open');
}

export function fmt(n) { return Math.trunc(n).toLocaleString('en-US'); }

// wire the static buttons
window.addEventListener('DOMContentLoaded', () => {
  boot();
  $('navPlay').onclick = () => startRun();
  $('homePlay').onclick = () => startRun();
  for (const b of document.querySelectorAll('[data-nav]')) b.onclick = () => { App.screen = b.dataset.nav; renderScreens(); };
  $('btnExitDrive').onclick = () => { App.screen = 'home'; renderScreens(); };
  $('btnRestart').onclick = () => startRun();
  $('resultClose').onclick = () => $('resultModal').classList.remove('open');
  $('resultAgain').onclick = () => { $('resultModal').classList.remove('open'); startRun(); };
});
