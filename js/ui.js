// The in-browser mod menu overlay. Mirrors the native menu's feature set, wired to the
// same modmenu.js logic. Original code.
import { VEHICLES, PARTS, STAGES, vehicleLevelSum, vehicleMaxSum, setUpgradeLevel, setCoins, setGems } from './save.js';
import {
  setFreezeCoins, setFreezeGems,
  unlockAllVehicles, unlockAllStages, maxVehicle, maxAllVehicles, resetVehicle,
  clampSpeed, clampScale,
} from './modmenu.js';

const ACCENTS = ['#ff9f29', '#ff5b57', '#a56bff', '#ffd23f', '#29d8e6', '#4fd06a'];

export function buildModMenu(App, { persist, renderScreens }) {
  const root = document.getElementById('modmenu');
  let tab = 'Economy';

  const refresh = () => {
    root.classList.toggle('open', App.features.menuOpen);
    document.getElementById('fab').classList.toggle('active', App.features.menuOpen);
    document.documentElement.style.setProperty('--accent', ACCENTS[App.features.accent % ACCENTS.length]);
    if (App.features.menuOpen) render();
  };
  document.addEventListener('modmenu:refresh', refresh);

  const save = () => { persist(); renderScreens(); render(); };
  const toast = (m) => document.dispatchEvent(new CustomEvent('modmenu:toast', { detail: m }));

  function h(tag, attrs = {}, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const kid of kids) e.append(kid);
    return e;
  }
  const btn = (label, on, cls = 'btn') => h('button', { class: cls, onclick: on }, label);
  const section = (title) => h('div', { class: 'mm-section' }, title);

  function toggleRow(label, get, set) {
    const input = h('input', { type: 'checkbox' });
    input.checked = get();
    input.onchange = () => { set(input.checked); save(); };
    return h('label', { class: 'mm-toggle' }, input, h('span', {}, label));
  }

  function slider(label, value, min, max, step, onInput) {
    const out = h('b', {}, String(value));
    const s = h('input', { type: 'range', min, max, step, value });
    s.oninput = () => { out.textContent = (+s.value).toFixed(2); onInput(+s.value); };
    s.onchange = () => save();
    return h('div', { class: 'mm-slider' }, h('div', { class: 'mm-slider-head' }, h('span', {}, label), out), s);
  }

  function render() {
    root.innerHTML = '';
    const f = App.features, s = App.save;
    // header
    const tabs = ['Economy', 'Garage', 'Stages', 'Run', 'World', 'Settings'];
    const head = h('div', { class: 'mm-head' },
      h('div', { class: 'mm-title' }, h('span', { class: 'mm-dot' }), 'HCR MOD MENU', h('span', { class: 'mm-badge' }, 'web')),
      btn('✕', () => { f.menuOpen = false; refresh(); }, 'mm-x'));
    const tabbar = h('div', { class: 'mm-tabs' }, ...tabs.map((t) =>
      btn(t, () => { tab = t; render(); }, 'mm-tab' + (t === tab ? ' active' : ''))));
    const body = h('div', { class: 'mm-body' });

    if (tab === 'Economy') {
      body.append(money('Coins', s.coins, '🪙', (v) => setCoins(s, v), () => f.freezeCoins, (on) => setFreezeCoins(s, f, on)));
      body.append(money('Gems', s.gems, '💎', (v) => setGems(s, v), () => f.freezeGems, (on) => setFreezeGems(s, f, on)));
    } else if (tab === 'Garage') {
      body.append(garage());
    } else if (tab === 'Stages') {
      body.append(stages());
    } else if (tab === 'Run') {
      body.append(section('Run'));
      body.append(toggleRow('Infinite fuel', () => f.infiniteFuel, (v) => f.infiniteFuel = v));
      body.append(toggleRow('No crash', () => f.noCrash, (v) => f.noCrash = v));
      body.append(btn('Refill fuel now', () => { if (App.car) { App.car.fuel = 1; toast('Tank refilled'); } }, 'btn btn-accent'));
      if (App.screen !== 'drive') body.append(h('p', { class: 'mm-hint' }, 'Start a run to use these live.'));
    } else if (tab === 'World') {
      body.append(section('Game speed'));
      body.append(slider('Speed', f.gameSpeed, 0.1, 4, 0.05, (v) => f.gameSpeed = clampSpeed(v)));
      body.append(h('div', { class: 'mm-row' }, ...[0.5, 1, 2, 3].map((v) => btn(v + '×', () => { f.gameSpeed = v; save(); }))));
      body.append(section('Physics toys'));
      body.append(slider('Gravity', f.gravityScale, 0, 3, 0.05, (v) => f.gravityScale = clampScale(v)));
      body.append(slider('Wheel torque', f.torqueScale, 0, 3, 0.05, (v) => f.torqueScale = clampScale(v)));
    } else if (tab === 'Settings') {
      body.append(section('Appearance'));
      body.append(h('div', { class: 'mm-row' }, ...ACCENTS.map((c, i) => {
        const b = h('button', { class: 'mm-swatch' + (i === f.accent ? ' active' : '') });
        b.style.background = c;
        b.onclick = () => { f.accent = i; save(); refresh(); };
        return b;
      })));
      body.append(toggleRow('Show HUD', () => f.showHud, (v) => f.showHud = v));
      body.append(section('Danger'));
      body.append(btn('Wipe save (fresh start)', () => {
        if (confirm('Reset all progress?')) { localStorage.removeItem('hcr-modmenu-test-save'); location.reload(); }
      }, 'btn btn-danger'));
      body.append(section('About'));
      body.append(h('p', { class: 'mm-hint' },
        'Clean-room fan reimplementation for testing a mod menu. Not affiliated with any publisher. Toggle with Insert or F1.'));
    }

    root.append(head, tabbar, body);
  }

  function money(label, value, icon, setFn, getFreeze, setFreeze) {
    const wrap = h('div', {});
    wrap.append(section(label));
    wrap.append(h('div', { class: 'mm-big' }, Math.trunc(value).toLocaleString('en-US') + ' ' + icon));
    const input = h('input', { type: 'number', value: label === 'Coins' ? 1000000 : 1000, class: 'mm-num' });
    const apply = (v) => { setFn(v); save(); };
    wrap.append(h('div', { class: 'mm-row' },
      input,
      btn('Set', () => apply(+input.value), 'btn btn-accent'),
      btn('Zero', () => apply(0)),
      btn('Max', () => apply(2_000_000_000))));
    wrap.append(h('div', { class: 'mm-row' }, ...[1e3, 1e4, 1e5, 1e6].map((d, i) =>
      btn('+' + ['1K', '10K', '100K', '1M'][i], () => apply(value + d)))));
    wrap.append(toggleRow('Freeze (spending never lowers it)', getFreeze, setFreeze));
    return wrap;
  }

  function garage() {
    const s = App.save;
    const wrap = h('div', {});
    wrap.append(h('div', { class: 'mm-row' },
      btn('Unlock all vehicles', () => { toast('Unlocked ' + unlockAllVehicles(s)); save(); }, 'btn btn-accent'),
      btn('Max every vehicle', () => { toast('Maxed ' + maxAllVehicles(s) + ' parts'); save(); }, 'btn btn-accent')));
    wrap.append(toggleRow('Keep everything unlocked', () => App.features.keepUnlocked, (v) => App.features.keepUnlocked = v));
    VEHICLES.forEach((v, i) => {
      const sum = vehicleLevelSum(s, v.id), max = vehicleMaxSum();
      const box = h('div', { class: 'mm-vehicle' });
      box.append(h('div', { class: 'mm-vehicle-head' },
        h('b', {}, v.name),
        h('span', { class: 'pill' + (s.car_selection === i ? ' pill-accent' : '') }, s.unlocked[v.id] ? 'unlocked' : 'locked')));
      const bar = h('div', { class: 'bar' }, h('span', {}));
      bar.firstChild.style.width = (sum / max * 100).toFixed(0) + '%';
      box.append(bar);
      box.append(h('div', { class: 'mm-row' },
        btn('Max', () => { maxVehicle(s, v.id); save(); }),
        btn('Reset', () => { resetVehicle(s, v.id, 1); save(); }),
        btn(s.unlocked[v.id] ? 'Select' : 'Unlock', () => { s.unlocked[v.id] = true; s.car_selection = i; save(); })));
      // per-part sliders
      PARTS.forEach((p) => {
        const lvl = s.upgrades[v.id][p.id];
        const out = h('b', {}, lvl + '/' + p.max);
        const sl = h('input', { type: 'range', min: 0, max: p.max, value: lvl });
        sl.oninput = () => { out.textContent = sl.value + '/' + p.max; setUpgradeLevel(s, v.id, p.id, +sl.value); };
        sl.onchange = () => save();
        box.append(h('div', { class: 'mm-slider mm-slider-sm' },
          h('div', { class: 'mm-slider-head' }, h('span', {}, p.name), out), sl));
      });
      wrap.append(box);
    });
    return wrap;
  }

  function stages() {
    const s = App.save;
    const wrap = h('div', {});
    wrap.append(btn('Unlock all stages', () => { toast('Unlocked ' + unlockAllStages(s)); save(); }, 'btn btn-accent'));
    STAGES.forEach((st, i) => {
      wrap.append(h('div', { class: 'mm-vehicle' },
        h('div', { class: 'mm-vehicle-head' },
          h('b', {}, st.name),
          h('label', { class: 'mm-toggle' },
            (() => { const c = h('input', { type: 'checkbox' }); c.checked = s.stages[st.id]; c.onchange = () => { s.stages[st.id] = c.checked; save(); }; return c; })(),
            h('span', {}, s.stages[st.id] ? 'unlocked' : 'locked')))));
    });
    return wrap;
  }

  // floating action button + toast relay
  const fab = document.getElementById('fab');
  fab.onclick = () => { App.features.menuOpen = !App.features.menuOpen; refresh(); };
  document.addEventListener('modmenu:toast', (e) => {
    const host = document.getElementById('toasts');
    const t = h('div', { class: 'toast' }, e.detail);
    host.append(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2000);
  });

  refresh();
}
