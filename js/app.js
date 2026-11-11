import * as store from './store.js';
import { PRESETS, MODES, ChessClock, tcLabel, clockLabel, fmtTime, fmtMin, parseTime } from './clock.js';

store.load();
const S = () => store.settings.get();

// ================= pomožne =================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fullName = p => p ? `${p.first} ${p.last}` : '';
const SIDE = { w: 'Beli', b: 'Črni' };

function seasonYear() {
  const d = new Date();
  return d.getMonth() >= 8 ? d.getFullYear() + 1 : d.getFullYear();
}
export function category(year) {
  if (!year) return '';
  const diff = seasonYear() - year;
  if (diff > 20) return 'Člani';
  let x = Math.max(8, diff % 2 ? diff + 1 : diff);
  return 'U' + x;
}
const age = year => (year ? new Date().getFullYear() - year : '');
const playerSub = p => `letnik ${p.year} · ${age(p.year)} let · ${category(p.year)}`;

function allClocks() { return [...PRESETS, ...store.clocks.list()]; }
function getClock(id) { return allClocks().find(c => c.id === id) || PRESETS[0]; }

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('sl-SI', { day: 'numeric', month: 'numeric', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('sl-SI', { hour: '2-digit', minute: '2-digit' });
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
}

// ================= modalna okna =================
function modal(title, body, { onMount, dismiss = true, wide = false } = {}) {
  const root = $('#modal-root');
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog">
      ${title ? `<div class="modal-h"><h2>${title}</h2>${dismiss ? '<button class="icon-btn" data-close aria-label="Zapri">✕</button>' : ''}</div>` : ''}
      <div class="modal-b">${body}</div></div>`;
  const close = () => el.remove();
  el.addEventListener('click', e => {
    if (dismiss && (e.target === el || e.target.closest('[data-close]'))) close();
  });
  root.appendChild(el);
  onMount?.(el, close);
  return { el, close };
}

function confirmBox(text, okText = 'Potrdi', danger = false) {
  return new Promise(res => {
    modal('', `<p class="confirm-t">${text}</p>
      <div class="row-btns"><button class="btn" data-no>Prekliči</button>
      <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${okText}</button></div>`, {
      onMount(el, close) {
        $('[data-no]', el).onclick = () => { close(); res(false); };
        $('[data-yes]', el).onclick = () => { close(); res(true); };
      },
    });
  });
}

// ================= zvok, vibracija, wake lock =================
let actx = null;
function audio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { } }
  if (actx?.state === 'suspended') actx.resume();
  return actx;
}
function beep(freq = 1000, dur = 0.05, vol = 0.25, delay = 0) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain();
  const t0 = a.currentTime + delay;
  o.frequency.value = freq; o.type = 'square';
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
const sounds = {
  tap() { if (S().tapSound) beep(1400, 0.035, 0.18); },
  low() { if (S().lowWarn) { beep(880, 0.12, 0.3); beep(880, 0.12, 0.3, 0.18); } },
  flag() { if (S().flagSound) { beep(440, 0.4, 0.35); beep(440, 0.4, 0.35, 0.55); beep(330, 0.7, 0.35, 1.1); } },
  start() { if (S().tapSound) beep(1200, 0.08, 0.2); },
};
const vib = p => { if (S().vibrate && navigator.vibrate) navigator.vibrate(p); };

let wakeLock = null;
async function lockScreen() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch { }
}
function unlockScreen() { try { wakeLock?.release(); } catch { } wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && game) lockScreen();
});

// ================= tema =================
export const THEMES = [
  { id: 'noc', name: 'Nočna' },
  { id: 'klasicna', name: 'Klasična' },
  { id: 'les', name: 'Les' },
  { id: 'morje', name: 'Morje' },
  { id: 'gozd', name: 'Gozd' },
  { id: 'lava', name: 'Lava' },
  { id: 'neon', name: 'Neon' },
  { id: 'kontrast', name: 'Visok kontrast' },
];
// barve za posamezno polovico (shema "Po izbiri igralcev")
export const PALETTES = [
  ...THEMES,
  { id: 'vijola', name: 'Vijola' },
  { id: 'roza', name: 'Roza' },
  { id: 'sonce', name: 'Sonce' },
];
const isCustom = () => S().theme === 'custom';
function applyTheme() { document.documentElement.dataset.theme = isCustom() ? 'noc' : S().theme; }

// ================= navigacija =================
let currentView = 'home';
const views = {};

function go(view) {
  currentView = view;
  $$('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  $('#view').onclick = null;
  $('#view').innerHTML = views[view]();
  $('#view').scrollTop = 0;
  bind[view]?.($('#view'));
}

// ================= DOMOV =================
views.home = () => {
  const s = S();
  const pl = store.players.list();
  const opts = sel => `<option value="">– izberi igralca –</option>` +
    pl.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.last)} ${esc(p.first)} (${p.year})</option>`).join('');
  const custom = store.clocks.list();
  const clockOpts = `<optgroup label="Prednastavljene">${PRESETS.map(c =>
    `<option value="${c.id}" ${c.id === s.lastClockId ? 'selected' : ''}>${esc(c.name)} · ${esc(clockLabel(c))}</option>`).join('')}</optgroup>` +
    (custom.length ? `<optgroup label="Moje ure">${custom.map(c =>
      `<option value="${c.id}" ${c.id === s.lastClockId ? 'selected' : ''}>${esc(c.name)} · ${esc(clockLabel(c))}</option>`).join('')}</optgroup>` : '');
  const cur = getClock(s.lastClockId);
  return `
  <header class="hero"><div class="logo">♞</div><div><h1>Šah Ura</h1><p class="muted">Pripravljena za igro</p></div></header>
  <div class="seg" role="tablist">
    <button data-mode="turnir" class="${s.mode === 'turnir' ? 'on' : ''}">Turnirska igra</button>
    <button data-mode="hitra" class="${s.mode === 'hitra' ? 'on' : ''}">Hitra igra</button>
  </div>
  <section class="card">
    <label class="lbl">Ura</label>
    <select id="h-clock">${clockOpts}</select>
    <div class="clock-note">${esc(cur.note || clockLabel(cur))}</div>
  </section>
  ${s.mode === 'turnir' ? `
  <section class="card">
    <div class="pick">
      <span class="piece w">♔</span>
      <div class="grow"><label class="lbl">Beli</label><select id="h-w">${opts(s.lastWhite)}</select></div>
    </div>
    <button class="swap" id="h-swap" title="Zamenjaj barvi">⇅ zamenjaj barvi</button>
    <div class="pick">
      <span class="piece b">♚</span>
      <div class="grow"><label class="lbl">Črni</label><select id="h-b">${opts(s.lastBlack)}</select></div>
    </div>
    <button class="btn ghost small" id="h-newp">＋ Nov igralec</button>
  </section>` : `
  <section class="card"><p class="muted">Hitra igra: Beli proti Črnemu, partija se ne zapiše v zgodovino.</p></section>`}
  <button class="btn primary big" id="h-start">▶ Začni</button>`;
};

const bind = {};
bind.home = v => {
  $$('[data-mode]', v).forEach(b => b.onclick = () => { store.settings.set({ mode: b.dataset.mode }); go('home'); });
  $('#h-clock', v).onchange = e => { store.settings.set({ lastClockId: e.target.value }); go('home'); };
  const w = $('#h-w', v), b = $('#h-b', v);
  if (w) {
    w.onchange = () => store.settings.set({ lastWhite: w.value });
    b.onchange = () => store.settings.set({ lastBlack: b.value });
    $('#h-swap', v).onclick = () => {
      store.settings.set({ lastWhite: b.value, lastBlack: w.value });
      go('home');
    };
    $('#h-newp', v).onclick = () => playerForm(null, p => {
      const s = S();
      if (!s.lastWhite) store.settings.set({ lastWhite: p.id });
      else if (!s.lastBlack) store.settings.set({ lastBlack: p.id });
      go('home');
    });
  }
  $('#h-start', v).onclick = () => {
    audio();
    const s = S();
    const def = getClock(s.lastClockId);
    if (s.mode === 'turnir') {
      const pw = store.players.get(s.lastWhite), pb = store.players.get(s.lastBlack);
      if (!pw || !pb) return toast('Izberi belega in črnega igralca.');
      if (pw.id === pb.id) return toast('Beli in črni morata biti različna igralca.');
      startGame(def, pw, pb);
    } else startGame(def, null, null);
  };
};

// ================= URE =================
views.clocks = () => {
  const s = S();
  const row = (c, custom) => `
    <div class="item ${c.id === s.lastClockId ? 'sel' : ''}" data-pick="${c.id}">
      <div class="grow"><div class="t">${esc(c.name)}</div>
        <div class="muted small">${esc(clockLabel(c))}${c.note ? ' · ' + esc(c.note) : ''}</div></div>
      ${c.id === s.lastClockId ? '<span class="chk">✓</span>' : ''}
      <button class="icon-btn" data-dup="${c.id}" title="Kopiraj">⧉</button>
      ${custom ? `<button class="icon-btn" data-edit="${c.id}" title="Uredi">✎</button>
      <button class="icon-btn" data-del="${c.id}" title="Izbriši">🗑</button>` : ''}
    </div>`;
  const custom = store.clocks.list();
  return `<h1 class="vh">Ure</h1>
  <button class="btn primary" id="c-new">＋ Nova ura</button>
  <h3 class="sec">Moje ure</h3>
  ${custom.length ? custom.map(c => row(c, true)).join('') : '<p class="muted">Še nimaš lastnih ur. Ustvari novo ali kopiraj prednastavljeno (⧉).</p>'}
  <h3 class="sec">Prednastavljene</h3>
  ${PRESETS.map(c => row(c, false)).join('')}`;
};
bind.clocks = v => {
  $('#c-new', v).onclick = () => clockForm(null);
  v.onclick = async e => {
    const t = e.target;
    if (t.dataset.dup) {
      const src = getClock(t.dataset.dup);
      clockForm({ ...JSON.parse(JSON.stringify(src)), id: null, name: src.name + ' (kopija)', note: undefined });
    } else if (t.dataset.edit) clockForm(store.clocks.get(t.dataset.edit));
    else if (t.dataset.del) {
      if (await confirmBox('Izbrišem to uro?', 'Izbriši', true)) {
        store.clocks.remove(t.dataset.del);
        if (S().lastClockId === t.dataset.del) store.settings.set({ lastClockId: 'p-pop' });
        go('clocks');
      }
    } else {
      const it = t.closest('[data-pick]');
      if (it) { store.settings.set({ lastClockId: it.dataset.pick }); toast('Ura izbrana'); go('clocks'); }
    }
  };
};

function tcEditor(prefix, t) {
  const stageRow = (s, i) => `<div class="stage" data-i="${i}">
     <input type="number" min="0" inputmode="numeric" class="s-min" value="${Math.floor(s.ms / 60000)}" aria-label="minute"><span>min</span>
     <input type="number" min="0" max="59" inputmode="numeric" class="s-sec" value="${Math.round((s.ms % 60000) / 1000)}" aria-label="sekunde"><span>s</span>
     <input type="number" min="0" inputmode="numeric" class="s-mov" value="${s.moves}" aria-label="poteze"><span>pot.</span>
     <button class="icon-btn s-del" title="Odstrani">✕</button></div>`;
  return `<div class="tc-ed" id="${prefix}">
    <div class="stages">${t.stages.map(stageRow).join('')}</div>
    <button class="btn ghost small add-stage">＋ Dodaj stopnjo</button>
    <p class="hint">Poteze = število potez v stopnji (0 = do konca partije). Npr. 90 min / 40 pot. + 30 min / 0.</p>
    <div class="two">
      <div><label class="lbl">Način</label><select class="mode">${Object.entries(MODES).map(([k, n]) =>
        `<option value="${k}" ${k === t.mode ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div><label class="lbl">Sekunde</label><input type="number" min="0" inputmode="numeric" class="inc" value="${t.inc}"></div>
    </div></div>`;
}
function readTc(el) {
  const stages = $$('.stage', el).map(r => ({
    ms: ((+$('.s-min', r).value || 0) * 60 + (+$('.s-sec', r).value || 0)) * 1000,
    moves: Math.max(0, Math.floor(+$('.s-mov', r).value || 0)),
  }));
  if (!stages.length || stages.some(s => s.ms <= 0)) return null;
  stages[stages.length - 1].moves = 0;
  const mode = $('.mode', el).value;
  const inc = mode === 'none' ? 0 : Math.max(0, +$('.inc', el).value || 0);
  return { stages, mode, inc };
}
function wireTc(el) {
  el.addEventListener('click', e => {
    if (e.target.closest('.add-stage')) {
      const box = $('.stages', el);
      const d = document.createElement('div');
      d.innerHTML = `<div class="stage"><input type="number" min="0" inputmode="numeric" class="s-min" value="30"><span>min</span>
        <input type="number" min="0" max="59" inputmode="numeric" class="s-sec" value="0"><span>s</span>
        <input type="number" min="0" inputmode="numeric" class="s-mov" value="0"><span>pot.</span>
        <button class="icon-btn s-del" title="Odstrani">✕</button></div>`;
      box.appendChild(d.firstElementChild);
    } else if (e.target.closest('.s-del')) {
      if ($$('.stage', el).length > 1) e.target.closest('.stage').remove();
    }
  });
}

function clockForm(def) {
  const d = def || { id: null, name: '', w: { stages: [{ ms: 10 * 60000, moves: 0 }], mode: 'fischer', inc: 5 }, b: null };
  const same = !d.b;
  modal(d.id ? 'Uredi uro' : 'Nova ura', `
    <label class="lbl">Ime ure</label><input id="cf-name" value="${esc(d.name)}" placeholder="npr. Trening 12+3">
    <label class="check"><input type="checkbox" id="cf-hc" ${same ? '' : 'checked'}> Različen čas za belega in črnega (hendikep)</label>
    <h3 class="sec" id="cf-wh">${same ? 'Čas (oba igralca)' : '♔ Beli'}</h3>
    ${tcEditor('cf-w', d.w)}
    <div id="cf-bwrap" ${same ? 'hidden' : ''}><h3 class="sec">♚ Črni</h3>${tcEditor('cf-b', d.b || d.w)}</div>
    <div class="row-btns"><button class="btn" data-close>Prekliči</button><button class="btn primary" id="cf-save">Shrani</button></div>`, {
    wide: true,
    onMount(el, close) {
      wireTc($('#cf-w', el)); wireTc($('#cf-b', el));
      $('#cf-hc', el).onchange = e => {
        $('#cf-bwrap', el).hidden = !e.target.checked;
        $('#cf-wh', el).textContent = e.target.checked ? '♔ Beli' : 'Čas (oba igralca)';
      };
      $('#cf-save', el).onclick = () => {
        const w = readTc($('#cf-w', el));
        const hc = $('#cf-hc', el).checked;
        const b = hc ? readTc($('#cf-b', el)) : null;
        if (!w || (hc && !b)) return toast('Vsaka stopnja mora imeti čas večji od 0.');
        const name = $('#cf-name', el).value.trim() || (hc ? `Hendikep ${tcLabel(w)} / ${tcLabel(b)}` : tcLabel(w));
        const saved = store.clocks.upsert({ id: d.id, name, w, b });
        store.settings.set({ lastClockId: saved.id });
        close();
        toast('Ura shranjena');
        go(currentView);
      };
    },
  });
}

// ================= IGRALCI =================
function stats(pid) {
  const gs = store.games.forPlayer(pid);
  let W = 0, D = 0, L = 0, ww = 0, bw = 0, wg = 0, bg = 0;
  gs.forEach(g => {
    const white = g.w.id === pid;
    white ? wg++ : bg++;
    if (g.result === '½-½') D++;
    else if ((g.result === '1-0') === white) { W++; white ? ww++ : bw++; }
    else L++;
  });
  const n = gs.length;
  return { n, W, D, L, pts: W + D / 2, pct: n ? Math.round(((W + D / 2) / n) * 100) : 0, wg, bg, ww, bw, games: gs };
}

views.players = () => {
  const pl = store.players.list();
  return `<h1 class="vh">Igralci</h1>
  <button class="btn primary" id="p-new">＋ Nov igralec</button>
  ${pl.length ? '' : '<p class="muted">Dodaj igralce, da se partije beležijo v zgodovino in statistiko.</p>'}
  ${pl.map(p => {
    const s = stats(p.id);
    return `<div class="item" data-pid="${p.id}">
      <div class="avatar">${esc((p.first[0] || '') + (p.last[0] || ''))}</div>
      <div class="grow"><div class="t">${esc(p.first)} ${esc(p.last)}</div>
      <div class="muted small">${playerSub(p)}</div></div>
      <div class="score"><b>${s.W}</b>-<b>${s.D}</b>-<b>${s.L}</b><div class="muted small">Z-R-P</div></div></div>`;
  }).join('')}`;
};
bind.players = v => {
  $('#p-new', v).onclick = () => playerForm(null, () => go('players'));
  v.onclick = e => {
    const it = e.target.closest('[data-pid]');
    if (it) playerDetail(it.dataset.pid);
  };
};

function playerForm(p, onSave) {
  const d = p || { first: '', last: '', year: '' };
  const y = new Date().getFullYear();
  modal(p ? 'Uredi igralca' : 'Nov igralec', `
    <label class="lbl">Ime</label><input id="pf-f" value="${esc(d.first)}" autocomplete="off">
    <label class="lbl">Priimek</label><input id="pf-l" value="${esc(d.last)}" autocomplete="off">
    <label class="lbl">Letnik rojstva</label><input id="pf-y" type="number" inputmode="numeric" min="1920" max="${y}" value="${d.year}" placeholder="npr. ${y - 10}">
    <div class="muted small" id="pf-cat"></div>
    <div class="row-btns"><button class="btn" data-close>Prekliči</button><button class="btn primary" id="pf-save">Shrani</button></div>`, {
    onMount(el, close) {
      const yi = $('#pf-y', el), cat = $('#pf-cat', el);
      const upd = () => { const v = +yi.value; cat.textContent = v > 1900 && v <= y ? `${y - v} let · kategorija ${category(v)}` : ''; };
      yi.oninput = upd; upd();
      setTimeout(() => $('#pf-f', el).focus(), 50);
      $('#pf-save', el).onclick = () => {
        const first = $('#pf-f', el).value.trim(), last = $('#pf-l', el).value.trim(), year = +yi.value;
        if (!first || !last) return toast('Vpiši ime in priimek.');
        if (!(year > 1900 && year <= y)) return toast('Vpiši veljaven letnik rojstva.');
        const saved = store.players.upsert({ ...(p || {}), first, last, year });
        close();
        toast('Igralec shranjen');
        onSave?.(saved);
      };
    },
  });
}

function gameRow(g, pid) {
  const res = g.result;
  let cls = 'd';
  if (pid) {
    const white = g.w.id === pid;
    if (res !== '½-½') cls = ((res === '1-0') === white) ? 'win' : 'loss';
  }
  return `<div class="item game-row" data-gid="${g.id}">
    <div class="grow"><div class="t"><span class="dot w"></span>${esc(g.w.name)} <span class="muted">–</span> <span class="dot b"></span>${esc(g.b.name)}</div>
    <div class="muted small">${fmtDate(g.date)} · ${esc(g.tc)} · ${esc(g.reason)} · ${g.moves} pot.</div></div>
    <div class="res ${pid ? cls : ''}">${res}</div></div>`;
}

function playerDetail(pid) {
  const p = store.players.get(pid);
  if (!p) return;
  const s = stats(pid);
  const m = modal(esc(fullName(p)), `
    <p class="muted">${playerSub(p)}</p>
    <div class="statgrid">
      <div><b>${s.n}</b><span>partij</span></div>
      <div class="win"><b>${s.W}</b><span>zmag</span></div>
      <div><b>${s.D}</b><span>remijev</span></div>
      <div class="loss"><b>${s.L}</b><span>porazov</span></div>
    </div>
    <div class="bar-pct"><div style="width:${s.pct}%"></div></div>
    <p class="small">Uspešnost <b>${s.pct} %</b> (${s.pts} / ${s.n} točk) · z belimi ${s.ww}/${s.wg} zmag · s črnimi ${s.bw}/${s.bg} zmag</p>
    <h3 class="sec">Zadnje partije</h3>
    ${s.games.slice(0, 15).map(g => gameRow(g, pid)).join('') || '<p class="muted">Ni še partij.</p>'}
    <div class="row-btns"><button class="btn danger" id="pd-del">Izbriši</button><button class="btn primary" id="pd-edit">Uredi</button></div>`, {
    wide: true,
    onMount(el, close) {
      $('#pd-edit', el).onclick = () => { close(); playerForm(p, () => { go('players'); playerDetail(pid); }); };
      $('#pd-del', el).onclick = async () => {
        if (await confirmBox(`Izbrišem igralca ${esc(fullName(p))}? Njegove partije ostanejo v zgodovini.`, 'Izbriši', true)) {
          store.players.remove(pid); close(); go('players');
        }
      };
    },
  });
  return m;
}

// ================= ZGODOVINA =================
let histFilter = '';
views.history = () => {
  const pl = store.players.list();
  const list = histFilter ? store.games.forPlayer(histFilter) : store.games.list();
  return `<h1 class="vh">Zgodovina</h1>
  <select id="hf"><option value="">Vsi igralci</option>${pl.map(p =>
    `<option value="${p.id}" ${p.id === histFilter ? 'selected' : ''}>${esc(p.last)} ${esc(p.first)}</option>`).join('')}</select>
  <p class="muted small">${list.length} partij</p>
  ${list.map(g => gameRow(g, histFilter)).join('') || '<p class="muted">Ni shranjenih partij. Turnirske partije se shranijo ob koncu igre.</p>'}`;
};
bind.history = v => {
  $('#hf', v).onchange = e => { histFilter = e.target.value; go('history'); };
};
document.addEventListener('click', e => {
  const r = e.target.closest('[data-gid]');
  if (!r) return;
  const g = store.games.list().find(x => x.id === r.dataset.gid);
  if (!g) return;
  modal('Partija', `
    <p><span class="dot w"></span><b>${esc(g.w.name)}</b> – <span class="dot b"></span><b>${esc(g.b.name)}</b></p>
    <p class="big-res">${g.result}</p>
    <table class="kv">
      <tr><td>Datum</td><td>${fmtDate(g.date)}</td></tr>
      <tr><td>Ura</td><td>${esc(g.clock)} (${esc(g.tc)})</td></tr>
      <tr><td>Konec</td><td>${esc(g.reason)}</td></tr>
      <tr><td>Poteze</td><td>${g.moves}</td></tr>
      <tr><td>Preostali čas</td><td>Beli ${fmtTime(g.wLeft)} · Črni ${fmtTime(g.bLeft)}</td></tr>
    </table>
    <div class="row-btns"><button class="btn danger" id="gd-del">Izbriši partijo</button><button class="btn" data-close>Zapri</button></div>`, {
    onMount(el, close) {
      $('#gd-del', el).onclick = async () => {
        if (await confirmBox('Izbrišem to partijo?', 'Izbriši', true)) {
          store.games.remove(g.id); close();
          $$('.overlay').forEach(o => o.remove());
          go(currentView);
        }
      };
    },
  });
});

// ================= NASTAVITVE =================
views.settings = () => {
  const s = S();
  const tg = (key, label) => `<label class="switch"><span>${label}</span><input type="checkbox" data-set="${key}" ${s[key] ? 'checked' : ''}><i></i></label>`;
  return `<h1 class="vh">Nastavitve</h1>
  <h3 class="sec">Barvna shema ure</h3>
  <div class="themes">
    <button class="theme ${s.theme === 'custom' ? 'on' : ''}" data-theme-pick="custom">
      <span class="sw"><i class="a" data-theme="lava">5:00</i><i class="a" data-theme="morje">4:12</i></span>Po izbiri igralcev</button>
    ${THEMES.map(t => `
    <button class="theme ${t.id === s.theme ? 'on' : ''}" data-theme-pick="${t.id}">
      <span class="sw" data-theme="${t.id}"><i class="a">5:00</i><i class="i">4:12</i></span>${t.name}</button>`).join('')}</div>
  <p class="hint">Po izbiri igralcev: pred začetkom igre vsak igralec na svoji polovici tapne barvo. Izbira se zapomni pri igralcu (pri hitri igri za belega/črnega).</p>
  <h3 class="sec">Zvok in opozorila</h3>
  <div class="card">
    ${tg('tapSound', 'Zvok ob pritisku ure')}
    ${tg('lowWarn', 'Opozorilo ob malo časa')}
    <label class="switch"><span>Prag opozorila</span>
      <select data-set-num="lowSec">${[5, 10, 20, 30, 60].map(n => `<option value="${n}" ${n === s.lowSec ? 'selected' : ''}>${n < 60 ? n + ' s' : '1 min'}</option>`).join('')}</select></label>
    ${tg('flagSound', 'Zvok ob padcu zastavice')}
    ${tg('vibrate', 'Vibracija')}
  </div>
  <h3 class="sec">Prikaz</h3>
  <div class="card">
    ${tg('rotateLandscape', 'Ležeče: obrni čas proti igralcema')}
    <p class="hint">Pokončno je zgornja polovica vedno obrnjena proti nasprotniku. Ležeče (tablica) lahko vsako polovico obrneš proti igralcu ob strani.</p>
  </div>
  <h3 class="sec">Podatki</h3>
  <div class="card">
    <p class="small muted">Igralci, zgodovina in lastne ure so shranjeni na tej napravi. Za prenos na drugo napravo izvozi varnostno kopijo in jo tam uvozi.</p>
    <div class="row-btns wrap">
      <button class="btn" id="s-exp">⭳ Izvozi kopijo</button>
      <button class="btn" id="s-imp">⭱ Uvozi kopijo</button>
      <input type="file" id="s-file" accept=".json,application/json" hidden>
    </div>
    <button class="btn danger ghost small" id="s-wipe">Pobriši vse podatke</button>
  </div>
  <p class="muted small center">Šah Ura · v1.1 · pravila FIDE za pospešeni in hitropotezni šah</p>`;
};
bind.settings = v => {
  $$('[data-set]', v).forEach(i => i.onchange = () => store.settings.set({ [i.dataset.set]: i.checked }));
  $$('[data-set-num]', v).forEach(i => i.onchange = () => store.settings.set({ [i.dataset.setNum]: +i.value }));
  $$('[data-theme-pick]', v).forEach(b => b.onclick = () => {
    store.settings.set({ theme: b.dataset.themePick }); applyTheme(); go('settings');
  });
  $('#s-exp', v).onclick = () => {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sah-ura-kopija-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('#s-imp', v).onclick = () => $('#s-file', v).click();
  $('#s-file', v).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const obj = JSON.parse(await f.text());
      const replace = await confirmBox(`Kopija vsebuje ${obj.players?.length || 0} igralcev in ${obj.games?.length || 0} partij.<br><br>
        <b>Združi</b> doda podatke k obstoječim, <b>Zamenjaj</b> pa obstoječe pobriše.`, 'Zamenjaj', true);
      // "Prekliči" v tem oknu pomeni združi
      store.importData(obj, replace ? 'replace' : 'merge');
      applyTheme();
      toast(replace ? 'Podatki zamenjani' : 'Podatki združeni');
      go('settings');
    } catch (err) { toast(err.message || 'Napaka pri uvozu'); }
    e.target.value = '';
  };
  $('#s-wipe', v).onclick = async () => {
    if (await confirmBox('Res pobrišem vse igralce, zgodovino, lastne ure in nastavitve?', 'Pobriši vse', true)) {
      store.wipe(); applyTheme(); toast('Podatki pobrisani'); go('settings');
    }
  };
};

// ================= IGRA =================
let game = null; // { clock, def, pw, pb, ui }

function startGame(def, pw, pb) {
  const clock = new ChessClock(def, {
    onFlag: side => onFlag(side),
    onStage: () => { sounds.start(); },
  });
  game = {
    clock, def, pw, pb, warned: { w: false, b: false }, ended: false, last: {},
    colors: { w: pw?.color || S().colorW || 'noc', b: pb?.color || S().colorB || 'morje' },
  };
  buildSwatches();
  $$('.toast').forEach(t => t.remove());
  const g = $('#game');
  g.hidden = false;
  document.body.classList.add('in-game');
  history.pushState({ game: 1 }, '');
  try { document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => { }); } catch { }
  lockScreen();
  layoutGame();
  renderGame(true);
  requestAnimationFrame(loop);
}

function sideOf(halfId) {
  const wb = S().whiteBottom;
  return halfId === 'half-b' ? (wb ? 'w' : 'b') : (wb ? 'b' : 'w');
}

function nameOf(side) {
  const p = side === 'w' ? game.pw : game.pb;
  return p ? fullName(p) : SIDE[side];
}

function buildSwatches() {
  const html = PALETTES.map(p => `<button class="swatch" data-c="${p.id}" data-theme="${p.id}" title="${p.name}" aria-label="${p.name}"></button>`).join('');
  $$('#game .swatches').forEach(el => { el.innerHTML = html; });
}

function applyHalfColors() {
  if (!game) return;
  const custom = isCustom();
  $('#game').classList.toggle('custom', custom);
  ['half-a', 'half-b'].forEach(id => {
    const half = $('#' + id), side = sideOf(id);
    if (custom) half.dataset.theme = game.colors[side]; else delete half.dataset.theme;
    $$('.swatch', half).forEach(b => b.classList.toggle('on', b.dataset.c === game.colors[side]));
  });
}

function pickColor(halfId, c) {
  if (!game || game.clock.started) return;
  const side = sideOf(halfId);
  game.colors[side] = c;
  const p = side === 'w' ? game.pw : game.pb;
  if (p) { p.color = c; store.players.upsert(p); }
  else store.settings.set(side === 'w' ? { colorW: c } : { colorB: c });
  applyHalfColors();
  vib(15);
}

function layoutGame() {
  const g = $('#game');
  if (g.hidden) return;
  const land = window.innerWidth > window.innerHeight;
  g.classList.toggle('land', land);
  const rotL = S().rotateLandscape;
  ['half-a', 'half-b'].forEach(id => {
    const half = $('#' + id), face = $('.face', half);
    const r = half.getBoundingClientRect();
    let rot = 0;
    if (!land && id === 'half-a') rot = 180;
    if (land && rotL) rot = id === 'half-a' ? 90 : -90;
    const sideways = Math.abs(rot) === 90;
    const fw = sideways ? r.height : r.width, fh = sideways ? r.width : r.height;
    face.style.width = fw + 'px';
    face.style.height = fh + 'px';
    face.style.transform = `translate(-50%,-50%) rotate(${rot}deg)`;
    face.dataset.fw = fw; face.dataset.fh = fh;
    face.dataset.len = '';
    face.style.setProperty('--nf', Math.max(14, Math.min(fw * 0.055, fh * 0.11)) + 'px');
  });
}
window.addEventListener('resize', layoutGame);
window.addEventListener('orientationchange', () => setTimeout(layoutGame, 150));

function renderGame(force = false) {
  if (!game) return;
  const c = game.clock;
  ['half-a', 'half-b'].forEach(id => {
    const side = sideOf(id);
    const half = $('#' + id);
    const rem = c.remaining(side);
    const timeStr = fmtTime(rem);
    const low = S().lowWarn && rem < S().lowSec * 1000 && rem > 0;
    const st = {
      active: c.active === side && !c.flag,
      run: c.running && c.active === side,
      low: low && c.active === side,
      flag: c.flag === side,
      waiting: !c.started,
    };
    for (const k in st) half.classList.toggle(k, st[k]);
    const key = id;
    const last = game.last[key] || {};
    if (force || last.t !== timeStr) {
      $('.time', half).textContent = timeStr; last.t = timeStr;
      const face = $('.face', half), len = Math.max(4, timeStr.length);
      if (face.dataset.len !== String(len)) {
        face.dataset.len = len;
        face.style.setProperty('--tf', Math.min(+face.dataset.fw * 1.05 / len, +face.dataset.fh * 0.42) + 'px');
      }
    }
    const dl = c.delayLeft(side);
    let info;
    if (!c.started) info = (side === 'b' ? 'Črni pritisne za začetek' : 'Beli začne') + (isCustom() ? ' · izberi barvo' : '');
    else if (c.flag === side) info = '⚑ Čas je potekel';
    else if (!c.running && c.active === side) info = '⏸ Pavza';
    else if (dl > 0) info = `zakasnitev ${Math.ceil(dl / 1000)} s`;
    else info = c.stageInfo(side);
    const moves = c.started ? `Poteze: ${c.p[side].moves}` : '';
    if (force || last.i !== info) { $('.info', half).textContent = info; last.i = info; }
    if (force || last.m !== moves) { $('.moves', half).textContent = moves; last.m = moves; }
    if (force) {
      applyHalfColors();
      $('.pname', half).innerHTML = `<span class="dot ${side}"></span>${esc(nameOf(side))}`;
    }
    game.last[key] = last;
  });
  $('#g-pause').textContent = c.running ? '⏸' : '▶';
  $('#g-pause').setAttribute('aria-label', c.running ? 'Pavza' : 'Nadaljuj');
  $('#g-swap').hidden = c.started;
  $('#g-arb').hidden = !c.started;
}

function loop() {
  if (!game) return;
  const c = game.clock;
  c.tick();
  if (c.running && c.active) {
    const side = c.active, rem = c.remaining(side);
    const thr = S().lowSec * 1000;
    if (!game.warned[side] && rem < thr && rem > 0) {
      const initial = c.p[side].tc.stages[0].ms;
      if (initial > thr) { sounds.low(); vib([80, 60, 80]); }
      game.warned[side] = true;
    }
  }
  ['w', 'b'].forEach(sd => { if (c.remaining(sd) > S().lowSec * 1000 + 1000) game.warned[sd] = false; });
  renderGame();
  requestAnimationFrame(loop);
}

function pressHalf(halfId) {
  if (!game || game.ended) return;
  const c = game.clock, side = sideOf(halfId);
  if (!c.started) {
    if (side === 'b') { c.start(); sounds.start(); vib(40); renderGame(true); }
    else toast('Črni pritisne svojo uro, da začne teči čas belega.');
    return;
  }
  if (!c.running || c.flag) return;
  if (side === c.active && c.press(side)) { sounds.tap(); vib(25); }
}

function onFlag(side) {
  sounds.flag(); vib([300, 120, 300, 120, 600]);
  renderGame(true);
  setTimeout(() => endDialog(side), 700);
}

function stopGame() {
  game = null;
  $('#game').hidden = true;
  document.body.classList.remove('in-game');
  unlockScreen();
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch { }
  $$('.overlay').forEach(o => o.remove());
  go('home');
}

function endDialog(flagSide = null) {
  if (!game) return;
  const c = game.clock;
  c.pause();
  renderGame(true);
  const tournament = !!game.pw;
  if (!tournament) {
    modal(flagSide ? 'Čas je potekel' : 'Konec igre', `
      ${flagSide ? `<p class="big-res">⚑ ${SIDE[flagSide]}</p><p class="center muted">${SIDE[flagSide === 'w' ? 'b' : 'w']} zmaga na čas (če ima še material za mat).</p>` : ''}
      <div class="row-btns"><button class="btn" id="e-home">Domov</button><button class="btn primary" id="e-again">Nova igra</button></div>`, {
      dismiss: false,
      onMount(el, close) {
        $('#e-home', el).onclick = () => { close(); stopGame(); };
        $('#e-again', el).onclick = () => { const d = game.def; close(); stopGame(); startGame(d, null, null); };
      },
    });
    return;
  }
  const pre = flagSide ? (flagSide === 'w' ? '0-1' : '1-0') : '';
  const reasons = ['Mat', 'Predaja', 'Čas', 'Remi (dogovor)', 'Pat', 'Ponavljanje / 50 potez', 'Premalo materiala', 'Drugo'];
  modal(flagSide ? 'Čas je potekel' : 'Konec partije', `
    ${flagSide ? `<p class="center">⚑ Čas je potekel: <b>${esc(nameOf(flagSide))}</b></p>
      <p class="hint center">Če nasprotnik nima dovolj materiala za mat, je rezultat remi.</p>` : ''}
    <label class="lbl">Rezultat</label>
    <div class="seg res-seg">
      <button data-r="1-0" class="${pre === '1-0' ? 'on' : ''}">1-0<small>${esc(game.pw.first)}</small></button>
      <button data-r="½-½">½-½<small>remi</small></button>
      <button data-r="0-1" class="${pre === '0-1' ? 'on' : ''}">0-1<small>${esc(game.pb.first)}</small></button>
    </div>
    <label class="lbl">Način konca</label>
    <select id="e-reason">${reasons.map(r => `<option ${flagSide && r === 'Čas' ? 'selected' : ''}>${r}</option>`).join('')}</select>
    <div class="row-btns">
      ${flagSide ? '<button class="btn" id="e-arb">Sodnik</button>' : '<button class="btn" id="e-back">Nazaj na uro</button>'}
      <button class="btn primary" id="e-save">Shrani partijo</button></div>
    <button class="btn ghost small danger" id="e-discard">Zavrzi brez shranjevanja</button>`, {
    dismiss: false,
    onMount(el, close) {
      let result = pre;
      $$('[data-r]', el).forEach(b => b.onclick = () => {
        result = b.dataset.r;
        $$('[data-r]', el).forEach(x => x.classList.toggle('on', x === b));
        const rs = $('#e-reason', el);
        if (result === '½-½' && ['Mat', 'Predaja', 'Čas'].includes(rs.value)) rs.value = 'Remi (dogovor)';
      });
      $('#e-back', el)?.addEventListener('click', () => { close(); });
      $('#e-arb', el)?.addEventListener('click', () => { close(); arbiterMenu(); });
      $('#e-discard', el).onclick = async () => {
        if (await confirmBox('Partija se ne bo shranila. Nadaljujem?', 'Zavrzi', true)) { close(); stopGame(); }
      };
      $('#e-save', el).onclick = () => {
        if (!result) return toast('Izberi rezultat.');
        const g = game;
        store.games.add({
          date: new Date().toISOString(),
          w: { id: g.pw.id, name: fullName(g.pw) },
          b: { id: g.pb.id, name: fullName(g.pb) },
          clock: g.def.name, tc: clockLabel(g.def),
          result, reason: $('#e-reason', el).value,
          moves: Math.max(c.p.w.moves, c.p.b.moves),
          wLeft: Math.max(0, Math.round(c.remaining('w'))), bLeft: Math.max(0, Math.round(c.remaining('b'))),
        });
        close();
        afterSave();
      };
    },
  });
}

function afterSave() {
  const g = game;
  game.ended = true;
  modal('Partija shranjena ✓', `
    <p class="center">${esc(fullName(g.pw))} – ${esc(fullName(g.pb))}</p>
    <div class="col-btns">
      <button class="btn primary" id="a-rev">⇅ Revanša (zamenjani barvi)</button>
      <button class="btn" id="a-same">↻ Še enkrat, enaki barvi</button>
      <button class="btn ghost" id="a-home">Domov</button></div>`, {
    dismiss: false,
    onMount(el, close) {
      const restart = (w, b) => { const d = g.def; close(); stopGame(); store.settings.set({ lastWhite: w.id, lastBlack: b.id }); startGame(d, w, b); };
      $('#a-rev', el).onclick = () => restart(g.pb, g.pw);
      $('#a-same', el).onclick = () => restart(g.pw, g.pb);
      $('#a-home', el).onclick = () => { close(); stopGame(); };
    },
  });
}

function arbiterMenu() {
  if (!game) return;
  const c = game.clock;
  c.pause();
  renderGame(true);
  const wN = esc(nameOf('w')), bN = esc(nameOf('b'));
  const m = modal('⚖ Sodnik – ura ustavljena', `
    <h3 class="sec">Nepravilna poteza (+1 min nasprotniku)</h3>
    <div class="row-btns">
      <button class="btn" data-add="w">+1 min<small>♔ ${wN}</small></button>
      <button class="btn" data-add="b">+1 min<small>♚ ${bN}</small></button></div>
    <h3 class="sec">Ročni popravek časa</h3>
    <div class="two">
      <div><label class="lbl">♔ ${wN}</label><input id="a-w" inputmode="decimal" value="${fmtTimeEdit(c.remaining('w'))}"></div>
      <div><label class="lbl">♚ ${bN}</label><input id="a-b" inputmode="decimal" value="${fmtTimeEdit(c.remaining('b'))}"></div>
    </div>
    <p class="hint">Oblika m:ss ali h:mm:ss</p>
    <button class="btn" id="a-set">Uporabi popravek</button>
    <h3 class="sec">Razveljavitev</h3>
    <button class="btn" id="a-undo" ${c.canUndo() ? '' : 'disabled'}>↶ Razveljavi zadnji pritisk</button>
    <h3 class="sec">Partija</h3>
    <div class="row-btns">
      <button class="btn" id="a-end">${game.pw ? 'Končaj in vpiši rezultat' : 'Končaj igro'}</button>
      <button class="btn danger" id="a-quit">Prekini</button></div>
    <button class="btn primary big" id="a-go" ${c.flag ? 'disabled' : ''}>▶ Nadaljuj</button>`, {
    wide: true,
    onMount(el, close) {
      const refresh = () => { $('#a-w', el).value = fmtTimeEdit(c.remaining('w')); $('#a-b', el).value = fmtTimeEdit(c.remaining('b')); $('#a-undo', el).disabled = !c.canUndo(); $('#a-go', el).disabled = !!c.flag; renderGame(true); };
      $$('[data-add]', el).forEach(b => b.onclick = () => {
        c.addTime(b.dataset.add, 60000); refresh(); toast(`+1 min: ${SIDE[b.dataset.add]}`);
      });
      $('#a-set', el).onclick = () => {
        const w = parseTime($('#a-w', el).value), b = parseTime($('#a-b', el).value);
        if (w === null || b === null) return toast('Neveljaven čas. Primer: 4:30');
        c.setTime('w', w); c.setTime('b', b); refresh(); toast('Čas popravljen');
      };
      $('#a-undo', el).onclick = () => { if (c.undo()) { refresh(); toast('Zadnji pritisk razveljavljen'); } };
      $('#a-end', el).onclick = () => { close(); endDialog(c.flag); };
      $('#a-quit', el).onclick = async () => {
        if (await confirmBox('Prekinem partijo brez shranjevanja?', 'Prekini', true)) { close(); stopGame(); }
      };
      $('#a-go', el).onclick = () => { close(); c.resume(); renderGame(true); };
    },
  });
  return m;
}
function fmtTimeEdit(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

// dogodki ure
['half-a', 'half-b'].forEach(id => {
  $('#' + id).addEventListener('pointerdown', e => {
    e.preventDefault(); audio();
    const sw = e.target.closest('.swatch');
    if (sw) { if (!game?.clock.started) pickColor(id, sw.dataset.c); return; }
    pressHalf(id);
  });
});
$('#g-pause').addEventListener('click', () => {
  if (!game) return;
  const c = game.clock;
  if (!c.started) { c.start(); sounds.start(); }
  else if (c.running) c.pause();
  else if (!c.flag && !$('.overlay')) c.resume();
  renderGame(true);
});
$('#g-arb').addEventListener('click', () => arbiterMenu());
$('#g-swap').addEventListener('click', () => { store.settings.set({ whiteBottom: !S().whiteBottom }); renderGame(true); });
$('#g-exit').addEventListener('click', async () => {
  if (!game) return;
  if (!game.clock.started) return stopGame();
  arbiterMenu();
});
document.addEventListener('keydown', e => {
  if (!game || $('.overlay')) return;
  if (e.code === 'Space') { e.preventDefault(); const c = game.clock; if (!c.started) pressHalf(S().whiteBottom ? 'half-a' : 'half-b'); else if (c.active) pressHalf(['half-a', 'half-b'].find(h => sideOf(h) === c.active)); }
});
// gumb "nazaj" na Androidu med igro odpre sodniški meni namesto izhoda
window.addEventListener('popstate', () => {
  if (game) { history.pushState({ game: 1 }, ''); if (game.clock.started && !$('.overlay')) arbiterMenu(); else if (!game.clock.started) stopGame(); }
});

// ================= zagon =================
$$('#tabs button').forEach(b => b.onclick = () => go(b.dataset.view));
applyTheme();
go('home');

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => { });
}

// za testiranje
window.__sahura = { store, get game() { return game; } };
