// Podatkovni sloj – vse branje/pisanje gre skozi ta modul.
// Zdaj: localStorage na napravi. Kasneje lahko isti API poveže s Supabase.

const KEY = 'sahura:data:v1';

const defaults = () => ({
  version: 1,
  players: [],   // {id, first, last, year}
  clocks: [],    // lastne ure: {id, name, w: TC, b: TC|null}
  games: [],     // shranjene partije
  settings: {
    theme: 'noc',
    tapSound: true,
    flagSound: true,
    lowWarn: true,
    lowSec: 10,
    vibrate: true,
    rotateLandscape: false,
    whiteBottom: true,
    colorW: 'noc',
    colorB: 'morje',
    lastClockId: 'p-pop',
    mode: 'turnir',
    lastWhite: '',
    lastBlack: '',
  },
});

let data = defaults();

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const d = defaults();
      data = { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
    }
  } catch (e) {
    console.warn('Napaka pri branju podatkov', e);
    data = defaults();
  }
  return data;
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Napaka pri shranjevanju', e);
  }
}

// ---------- igralci ----------
export const players = {
  list() {
    return [...data.players].sort((a, b) =>
      (a.last + ' ' + a.first).localeCompare(b.last + ' ' + b.first, 'sl'));
  },
  get(id) { return data.players.find(p => p.id === id) || null; },
  upsert(p) {
    if (!p.id) { p.id = uid(); data.players.push(p); }
    else {
      const i = data.players.findIndex(x => x.id === p.id);
      if (i >= 0) data.players[i] = p; else data.players.push(p);
    }
    save();
    return p;
  },
  remove(id) { data.players = data.players.filter(p => p.id !== id); save(); },
};

// ---------- lastne ure ----------
export const clocks = {
  list() { return data.clocks; },
  get(id) { return data.clocks.find(c => c.id === id) || null; },
  upsert(c) {
    if (!c.id) { c.id = 'c-' + uid(); data.clocks.push(c); }
    else {
      const i = data.clocks.findIndex(x => x.id === c.id);
      if (i >= 0) data.clocks[i] = c; else data.clocks.push(c);
    }
    save();
    return c;
  },
  remove(id) { data.clocks = data.clocks.filter(c => c.id !== id); save(); },
};

// ---------- partije ----------
export const games = {
  list() { return [...data.games].sort((a, b) => b.date.localeCompare(a.date)); },
  add(g) { g.id = uid(); data.games.push(g); save(); return g; },
  remove(id) { data.games = data.games.filter(g => g.id !== id); save(); },
  forPlayer(pid) { return this.list().filter(g => g.w.id === pid || g.b.id === pid); },
};

// ---------- nastavitve ----------
export const settings = {
  get() { return data.settings; },
  set(patch) { Object.assign(data.settings, patch); save(); },
};

// ---------- izvoz / uvoz ----------
export function exportData() {
  return JSON.stringify({ app: 'sahura', exported: new Date().toISOString(), ...data }, null, 2);
}

export function importData(obj, mode = 'merge') {
  if (!obj || !Array.isArray(obj.players) || !Array.isArray(obj.games)) {
    throw new Error('Datoteka ni varnostna kopija aplikacije Šah Ura.');
  }
  if (mode === 'replace') {
    const d = defaults();
    data = {
      ...d,
      players: obj.players, clocks: obj.clocks || [], games: obj.games,
      settings: { ...d.settings, ...(obj.settings || {}) },
    };
  } else {
    const mergeArr = (cur, inc) => {
      const map = new Map(cur.map(x => [x.id, x]));
      inc.forEach(x => { if (x && x.id) map.set(x.id, x); });
      return [...map.values()];
    };
    data.players = mergeArr(data.players, obj.players);
    data.clocks = mergeArr(data.clocks, obj.clocks || []);
    data.games = mergeArr(data.games, obj.games);
  }
  save();
}

export function wipe() {
  data = defaults();
  save();
}
