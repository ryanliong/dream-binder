// The album lives in localStorage. Entries are keyed "lang:cardId" because the same
// card ID can exist in both English and Japanese.
//
// Each entry carries `updatedAt`; removed cards stay as tombstones (`deleted: true`)
// so that Gist sync can merge devices with last-write-wins per card.

const KEY = 'db.album.v1';
const TOMBSTONE_TTL = 1000 * 60 * 60 * 24 * 120; // forget deletions after ~4 months

export const STATUSES = ['wishlist', 'owned'];
export const keyOf = (lang, id) => `${lang}:${id}`;

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw.entries === 'object') return raw;
  } catch {}
  return { version: 1, entries: {} };
}

function save(source = 'local') {
  const cutoff = Date.now() - TOMBSTONE_TTL;
  for (const [k, e] of Object.entries(state.entries)) {
    if (e.deleted && Date.parse(e.updatedAt) < cutoff) delete state.entries[k];
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not save album', err);
  }
  listeners.forEach((fn) => fn(source));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const now = () => new Date().toISOString();

export function has(key) {
  const e = state.entries[key];
  return !!e && !e.deleted;
}

export function get(key) {
  return has(key) ? state.entries[key] : null;
}

/** Live (non-deleted) entries. */
export function list() {
  return Object.values(state.entries).filter((e) => !e.deleted);
}

export function count() {
  return list().length;
}

/** Raw state including tombstones — used by sync. */
export function rawEntries() {
  return state.entries;
}

function normalise(card) {
  return {
    lang: card.lang,
    id: card.id,
    name: card.name ?? '',
    setId: card.setId ?? '',
    setName: card.setName ?? '',
    number: card.number ?? '',
    rarity: card.rarity ?? '',
    image: card.image ?? '',
  };
}

export function add(card) {
  const key = keyOf(card.lang, card.id);
  if (has(key)) return state.entries[key];
  const t = now();
  state.entries[key] = { ...normalise(card), addedAt: t, status: 'wishlist', notes: '', updatedAt: t };
  save();
  return state.entries[key];
}

export function remove(key) {
  const e = state.entries[key];
  if (!e || e.deleted) return;
  state.entries[key] = { lang: e.lang, id: e.id, deleted: true, updatedAt: now() };
  save();
}

export function toggle(card) {
  const key = keyOf(card.lang, card.id);
  if (has(key)) {
    remove(key);
    return false;
  }
  add(card);
  return true;
}

/** User edits (status, notes) bump updatedAt so they win when syncing. */
export function update(key, patch) {
  if (!has(key)) return;
  state.entries[key] = { ...state.entries[key], ...patch, updatedAt: now() };
  save();
}

/** Fill in card metadata (rarity, set name…) without counting as a user edit. */
export function enrich(key, card) {
  if (!has(key)) return;
  const e = state.entries[key];
  const fresh = normalise({ ...card, lang: e.lang, id: e.id });
  let changed = false;
  for (const [k, v] of Object.entries(fresh)) {
    if (v && e[k] !== v) { e[k] = v; changed = true; }
  }
  if (changed) save('enrich');
}

/** Tombstone everything (so the clear also propagates through sync). */
export function clear() {
  const t = now();
  for (const [k, e] of Object.entries(state.entries)) {
    if (!e.deleted) state.entries[k] = { lang: e.lang, id: e.id, deleted: true, updatedAt: t };
  }
  save();
}

// ---- Backup file ------------------------------------------------------------

export function exportData() {
  return {
    app: 'dream-binder',
    version: 1,
    exportedAt: now(),
    entries: list(),
  };
}

function validEntry(e) {
  return e && typeof e === 'object' && (e.lang === 'en' || e.lang === 'ja') && typeof e.id === 'string' && e.id;
}

/**
 * Merge a backup file into the album (never overwrites wholesale).
 * - Cards not currently in the album are added (even if previously removed — importing is explicit).
 * - Cards already present keep the newer status/notes.
 */
export function importData(data) {
  const incoming = Array.isArray(data) ? data : data?.entries;
  if (!Array.isArray(incoming)) throw new Error("That file doesn't look like a Dream Binder backup.");

  const summary = { added: [], updated: [], unchanged: 0, invalid: 0 };
  const t = now();
  for (const raw of incoming) {
    if (!validEntry(raw) || raw.deleted) { summary.invalid += raw?.deleted ? 0 : 1; continue; }
    const key = keyOf(raw.lang, raw.id);
    const status = STATUSES.includes(raw.status) ? raw.status : 'wishlist';
    const entry = {
      ...normalise(raw),
      addedAt: raw.addedAt || t,
      status,
      notes: typeof raw.notes === 'string' ? raw.notes : '',
    };
    if (!has(key)) {
      state.entries[key] = { ...entry, updatedAt: t };
      summary.added.push(entry.name || raw.id);
      continue;
    }
    const local = state.entries[key];
    const newer = Date.parse(raw.updatedAt || 0) > Date.parse(local.updatedAt || 0);
    if (newer && (local.status !== status || local.notes !== entry.notes)) {
      state.entries[key] = { ...local, status, notes: entry.notes, updatedAt: t };
      summary.updated.push(entry.name || raw.id);
    } else {
      summary.unchanged++;
    }
  }
  if (summary.added.length || summary.updated.length) save();
  return summary;
}

// ---- Sync merge (last-write-wins per card, tombstones included) -------------

/** Merge remote entries into local state. Returns true if local changed. */
export function mergeRemote(remoteEntries) {
  let changed = false;
  for (const [key, r] of Object.entries(remoteEntries || {})) {
    if (!validEntry(r)) continue;
    const l = state.entries[key];
    if (!l || Date.parse(r.updatedAt || 0) > Date.parse(l.updatedAt || 0)) {
      state.entries[key] = r;
      changed = true;
    }
  }
  if (changed) save('sync');
  return changed;
}

// Keep tabs in sync with each other.
window.addEventListener('storage', (e) => {
  if (e.key === KEY) {
    state = load();
    listeners.forEach((fn) => fn('storage'));
  }
});
