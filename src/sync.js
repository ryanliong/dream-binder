// Cross-device sync through a private GitHub Gist.
//
// The album (tombstones included) is stored as one JSON file in a secret gist on the
// user's own GitHub account. Every sync: pull → merge (last-write-wins per card) → push
// if anything differs. The token only needs the `gist` scope and never leaves this
// browser except in requests to api.github.com.

import * as album from './album.js';
import { debounce } from './ui.js';

const KEY = 'db.sync.v1';
const FILE = 'dream-binder-album.json';
const API = 'https://api.github.com';

let cfg = load();
let syncing = false;
let again = false;
const listeners = new Set();

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch {}
  listeners.forEach((fn) => fn(status()));
}

export function status() {
  return {
    connected: !!(cfg.token && cfg.gistId),
    login: cfg.login || null,
    gistId: cfg.gistId || null,
    lastSyncAt: cfg.lastSyncAt || null,
    lastError: cfg.lastError || null,
    syncing,
  };
}

export function onStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function gh(path, { method = 'GET', body, token = cfg.token } = {}) {
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(navigator.onLine === false ? "You're offline — will sync when you're back." : "Couldn't reach GitHub.");
  }
  if (res.status === 401) throw Object.assign(new Error('GitHub rejected the token — it may have expired or been revoked.'), { status: 401 });
  if (res.status === 403 || res.status === 404) {
    throw Object.assign(new Error(res.status === 404 ? 'Sync gist not found.' : 'GitHub refused the request — does the token have the “gist” scope?'), { status: res.status });
  }
  if (!res.ok) throw Object.assign(new Error(`GitHub error ${res.status}.`), { status: res.status });
  return res.status === 204 ? null : res.json();
}

const fileContent = () => JSON.stringify({
  app: 'dream-binder',
  version: 1,
  updatedAt: new Date().toISOString(),
  entries: album.rawEntries(),
}, null, 1);

async function createGist(token) {
  const g = await gh('/gists', {
    method: 'POST',
    token,
    body: {
      description: 'Dream Binder album — synced by https://ryanliong.github.io/dream-binder/',
      public: false,
      files: { [FILE]: { content: fileContent() } },
    },
  });
  return g.id;
}

/** Validate the token, find (or create) the album gist, then sync. */
export async function connect(token) {
  token = token.trim();
  if (!token) throw new Error('Paste a GitHub token first.');
  const user = await gh('/user', { token });
  let gistId = null;
  for (let page = 1; page <= 5 && !gistId; page++) {
    const list = await gh(`/gists?per_page=100&page=${page}`, { token });
    gistId = list.find((g) => g.files && g.files[FILE])?.id || null;
    if (list.length < 100) break;
  }
  const created = !gistId;
  if (!gistId) gistId = await createGist(token);
  cfg = { token, gistId, login: user.login, lastSyncAt: null, lastError: null };
  persist();
  await syncNow();
  return { created, login: user.login };
}

export function disconnect() {
  cfg = {};
  persist();
}

function stable(entries) {
  return JSON.stringify(Object.keys(entries || {}).sort().map((k) => {
    const e = entries[k];
    return [k, Object.keys(e).sort().map((f) => [f, e[f]])];
  }));
}

export async function syncNow() {
  if (!cfg.token || !cfg.gistId) return;
  if (syncing) { again = true; return; }
  syncing = true;
  persist();
  try {
    let gist;
    try {
      gist = await gh(`/gists/${cfg.gistId}`);
    } catch (err) {
      if (err.status !== 404) throw err;
      cfg.gistId = await createGist(cfg.token); // gist was deleted — start a fresh one
      gist = await gh(`/gists/${cfg.gistId}`);
    }
    const file = gist.files?.[FILE];
    let text = file?.content || '';
    if (file?.truncated && file.raw_url) text = await (await fetch(file.raw_url, { cache: 'no-store' })).text();
    let remote = {};
    try { remote = JSON.parse(text || '{}').entries || {}; } catch { remote = {}; }

    album.mergeRemote(remote);
    if (stable(remote) !== stable(album.rawEntries())) {
      await gh(`/gists/${cfg.gistId}`, { method: 'PATCH', body: { files: { [FILE]: { content: fileContent() } } } });
    }
    cfg.lastSyncAt = new Date().toISOString();
    cfg.lastError = null;
  } catch (err) {
    cfg.lastError = err.message;
  } finally {
    syncing = false;
    persist();
    if (again) { again = false; syncNow(); }
  }
}

// ---- Automatic triggers -------------------------------------------------------------

const pushSoon = debounce(syncNow, 2500);
album.subscribe((source) => {
  if (source === 'local' || source === 'enrich') pushSoon();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const last = Date.parse(cfg.lastSyncAt || 0);
  if (Date.now() - last > 60_000) syncNow();
});

window.addEventListener('online', () => syncNow());

export function startSync() {
  if (status().connected) syncNow();
}
