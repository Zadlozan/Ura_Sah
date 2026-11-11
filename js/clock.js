// Logika šahovske ure (neodvisna od prikaza).
//
// Časovna kontrola (TC):
//   { stages: [{ ms, moves }], mode: 'fischer'|'bronstein'|'delay'|'none', inc: sekunde }
//   moves = število potez v stopnji (0 = do konca partije)
// Definicija ure: { id, name, w: TC, b: TC|null }  (b = null → enako kot beli)

const M = 60000;
const tc = (stages, mode = 'none', inc = 0) => ({ stages, mode, inc });
const st = (min, moves = 0, sec = 0) => ({ ms: min * M + sec * 1000, moves });

export const PRESETS = [
  { id: 'p-pop', name: 'POP – Primorski osnovnošolski pokal', note: 'FIDE pospešeni, nepravilna poteza: +1 min nasprotniku', w: tc([st(10)], 'fischer', 5), b: null },
  { id: 'p-u9', name: 'Najmlajši (U9) – 25 min', note: 'Regijska prvenstva, skupina F/D9', w: tc([st(25)]), b: null },
  { id: 'p-r1510', name: 'Pospešeni 15+10', note: 'Svetovno prvenstvo v pospešenem šahu', w: tc([st(15)], 'fischer', 10), b: null },
  { id: 'p-b53', name: 'Hitropotezni 5+3', w: tc([st(5)], 'fischer', 3), b: null },
  { id: 'p-b32', name: 'Hitropotezni 3+2', note: 'Svetovno prvenstvo v hitropoteznem šahu', w: tc([st(3)], 'fischer', 2), b: null },
  { id: 'p-b50', name: 'Hitropotezni 5+0', w: tc([st(5)]), b: null },
  { id: 'p-bul', name: 'Bullet 1+0', w: tc([st(1)]), b: null },
  { id: 'p-cl', name: 'Klasični FIDE 90/40 + 30', note: '90 min za 40 potez, nato 30 min, +30 s od 1. poteze', w: tc([st(90, 40), st(30)], 'fischer', 30), b: null },
];

export const MODES = {
  fischer: 'Fischer (dodatek)',
  bronstein: 'Bronstein',
  delay: 'Zakasnitev',
  none: 'Brez',
};

export function fmtMin(ms) {
  if (ms % M === 0) return String(ms / M);
  const s = Math.round(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export function tcLabel(t) {
  if (!t) return '';
  const base = t.stages.map((s, i) =>
    (i < t.stages.length - 1 && s.moves > 0) ? `${fmtMin(s.ms)}/${s.moves}` : fmtMin(s.ms)).join(' + ');
  const multi = t.stages.length > 1;
  if (t.mode === 'none' || !t.inc) return multi ? base : `${base} min`;
  if (t.mode === 'fischer') return multi ? `${base}, +${t.inc} s` : `${base}+${t.inc}`;
  if (t.mode === 'bronstein') return `${base}, Bronstein ${t.inc} s`;
  return `${base}, zakasnitev ${t.inc} s`;
}

export function clockLabel(def) {
  if (def.b) return `B ${tcLabel(def.w)} · Č ${tcLabel(def.b)}`;
  return tcLabel(def.w);
}

export function fmtTime(ms) {
  if (ms <= 0) return '0:00';
  if (ms < 20000) {
    const t = Math.floor(ms / 100);
    return `${Math.floor(t / 10)}.${t % 10}`;
  }
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// "m:ss", "h:mm:ss", "m" → ms
export function parseTime(str) {
  const parts = String(str).trim().replace(',', '.').split(':').map(Number);
  if (!parts.length || parts.some(n => isNaN(n) || n < 0)) return null;
  let s = 0;
  if (parts.length === 1) s = parts[0] * 60;
  else if (parts.length === 2) s = parts[0] * 60 + parts[1];
  else if (parts.length === 3) s = parts[0] * 3600 + parts[1] * 60 + parts[2];
  else return null;
  return Math.round(s * 1000);
}

const other = s => (s === 'w' ? 'b' : 'w');

export class ChessClock {
  constructor(def, hooks = {}) {
    this.hooks = hooks;
    const mk = t => ({ tc: t, rem: t.stages[0].ms, moves: 0, stage: 0 });
    this.p = { w: mk(def.w), b: mk(def.b || def.w) };
    this.active = null;
    this.running = false;
    this.started = false;
    this.flag = null;
    this.turnElapsed = 0;
    this.segStart = 0;
    this.undoStack = [];
  }

  now() { return performance.now(); }
  elapsed() { return this.turnElapsed + (this.running ? this.now() - this.segStart : 0); }
  charged(side, e) {
    const t = this.p[side].tc;
    return t.mode === 'delay' ? Math.max(0, e - t.inc * 1000) : e;
  }
  remaining(side) {
    const s = this.p[side];
    if (side !== this.active || this.flag) return s.rem;
    return s.rem - this.charged(side, this.elapsed());
  }
  delayLeft(side) {
    if (side !== this.active || this.flag) return 0;
    const t = this.p[side].tc;
    if (t.mode !== 'delay') return 0;
    return Math.max(0, t.inc * 1000 - this.elapsed());
  }
  stageInfo(side) {
    const s = this.p[side], t = s.tc;
    if (t.stages.length < 2) return '';
    const cur = t.stages[s.stage];
    if (cur.moves > 0 && s.stage < t.stages.length - 1) {
      let cum = 0;
      for (let i = 0; i <= s.stage; i++) cum += t.stages[i].moves;
      return `do kontrole: ${cum - s.moves} pot.`;
    }
    return `stopnja ${s.stage + 1}/${t.stages.length}`;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.active = 'w';
    this.running = true;
    this.turnElapsed = 0;
    this.segStart = this.now();
  }
  pause() {
    if (!this.running) return;
    this.turnElapsed += this.now() - this.segStart;
    this.running = false;
  }
  resume() {
    if (this.running || this.flag || !this.started) return;
    this.running = true;
    this.segStart = this.now();
  }

  _snap(side, remAtPress) {
    const c = x => ({ rem: x.rem, moves: x.moves, stage: x.stage });
    const snap = { p: { w: c(this.p.w), b: c(this.p.b) }, active: side };
    snap.p[side].rem = remAtPress;
    return snap;
  }

  // Igralec "side" pritisne svojo uro (konča potezo).
  press(side) {
    if (!this.running || side !== this.active || this.flag) return false;
    const e = this.elapsed();
    const s = this.p[side], t = s.tc;
    const remNow = s.rem - this.charged(side, e);
    if (remNow <= 0) { this._flag(side); return false; }
    this.undoStack.push(this._snap(side, remNow));
    if (this.undoStack.length > 200) this.undoStack.shift();
    s.rem = remNow;
    s.moves++;
    if (t.mode === 'fischer') s.rem += t.inc * 1000;
    else if (t.mode === 'bronstein') s.rem += Math.min(t.inc * 1000, e);
    if (s.stage < t.stages.length - 1 && t.stages[s.stage].moves > 0) {
      let cum = 0;
      for (let i = 0; i <= s.stage; i++) cum += t.stages[i].moves;
      if (s.moves >= cum) {
        s.stage++;
        s.rem += t.stages[s.stage].ms;
        this.hooks.onStage?.(side, s.stage);
      }
    }
    this.active = other(side);
    this.turnElapsed = 0;
    this.segStart = this.now();
    return true;
  }

  tick() {
    if (this.running && this.active && this.remaining(this.active) <= 0) this._flag(this.active);
  }

  _flag(side) {
    this.p[side].rem = 0;
    this.turnElapsed = 0;
    this.running = false;
    this.flag = side;
    this.hooks.onFlag?.(side);
  }

  canUndo() { return this.undoStack.length > 0; }

  undo() {
    const snap = this.undoStack.pop();
    if (!snap) return false;
    for (const k of ['w', 'b']) Object.assign(this.p[k], snap.p[k]);
    this.active = snap.active;
    this.flag = null;
    this.running = false;
    this.turnElapsed = 0;
    return true;
  }

  addTime(side, ms) {
    this.p[side].rem += ms;
    if (this.flag === side && this.p[side].rem > 0) this.flag = null;
  }

  setTime(side, ms) {
    const extra = (side === this.active && !this.flag) ? this.charged(side, this.elapsed()) : 0;
    this.p[side].rem = ms + extra;
    if (this.flag === side && ms > 0) this.flag = null;
  }
}
