// TCGdex client with an in-memory + sessionStorage cache.
// Docs: https://tcgdex.dev — no API key. Every call is scoped to a language ("en" | "ja").

const BASE = 'https://api.tcgdex.net/v2';
const SS_PREFIX = 'db:api:';
const TIMEOUT_MS = 15000;

const mem = new Map();
const inflight = new Map();

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

export function buildUrl(lang, path, params) {
  const url = new URL(`${BASE}/${lang}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

function readSession(key) {
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function writeSession(key, data) {
  const raw = JSON.stringify(data);
  try {
    sessionStorage.setItem(SS_PREFIX + key, raw);
  } catch {
    // Quota exceeded: drop our cached API responses and try once more.
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith(SS_PREFIX)) sessionStorage.removeItem(k);
      }
      sessionStorage.setItem(SS_PREFIX + key, raw);
    } catch {
      /* memory cache still works */
    }
  }
}

async function fetchJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } catch (err) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    throw new ApiError(
      offline ? "You're offline. Check your connection and try again." :
      err.name === 'AbortError' ? 'TCGdex took too long to respond.' :
      "Couldn't reach TCGdex.",
    );
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 404) throw new ApiError('Not found on TCGdex.', 404);
  if (!res.ok) throw new ApiError(`TCGdex returned an error (${res.status}).`, res.status);
  return res.json();
}

/** Cached GET. Same URL is fetched at most once per session. */
export function tcg(lang, path, params) {
  const url = buildUrl(lang, path, params);
  if (mem.has(url)) return Promise.resolve(mem.get(url));
  const cached = readSession(url);
  if (cached !== undefined) {
    mem.set(url, cached);
    return Promise.resolve(cached);
  }
  if (inflight.has(url)) return inflight.get(url);
  const p = fetchJSON(url)
    .then((data) => {
      mem.set(url, data);
      writeSession(url, data);
      return data;
    })
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/** Synchronous cache lookup — lets views render instantly on back-navigation. */
export function peek(lang, path, params) {
  const url = buildUrl(lang, path, params);
  if (mem.has(url)) return mem.get(url);
  const cached = readSession(url);
  if (cached !== undefined) mem.set(url, cached);
  return cached;
}

/** Drop a cached response (used when refreshing prices). */
export function forget(lang, path, params) {
  const url = buildUrl(lang, path, params);
  mem.delete(url);
  try { sessionStorage.removeItem(SS_PREFIX + url); } catch {}
}

// ---- Endpoint helpers --------------------------------------------------

const SETS_PARAMS = { 'sort:field': 'releaseDate', 'sort:order': 'DESC' };

export const getSets = (lang) => tcg(lang, '/sets', SETS_PARAMS);
export const peekSets = (lang) => peek(lang, '/sets', SETS_PARAMS);
export const getSet = (lang, id) => tcg(lang, `/sets/${encodeURIComponent(id)}`);
export const peekSet = (lang, id) => peek(lang, `/sets/${encodeURIComponent(id)}`);
export const getCard = (lang, id) => tcg(lang, `/cards/${encodeURIComponent(id)}`);
export const getRarities = (lang) => tcg(lang, '/rarities');

/**
 * Rarity presets that TCGdex's own rarity tags don't capture. Its "Full Art Trainer" tag
 * covers only 6 cards (Lost Origin TG23–28); real full-art trainers are tagged
 * Ultra Rare / Special illustration rare / Secret Rare / Hyper rare, so combine them.
 */
export const RARITY_PRESETS = {
  '@fa-trainers': {
    label: 'Full-art trainers (all eras)',
    category: 'Trainer',
    rarities: ['Ultra Rare', 'Special illustration rare', 'Secret Rare', 'Hyper rare', 'Mega Hyper Rare', 'Full Art Trainer'],
  },
};

/** Card search. Filters are substring matches unless prefixed with "eq:"; "|" means OR. */
export function searchCards(lang, { name, setId, rarity, page = 1, perPage = 60 }) {
  const preset = RARITY_PRESETS[rarity];
  return tcg(lang, '/cards', {
    name: name || undefined,
    'set.id': setId ? `eq:${setId}` : undefined,
    category: preset ? `eq:${preset.category}` : undefined,
    rarity: preset ? `eq:${preset.rarities.join('|')}` : rarity ? `eq:${rarity}` : undefined,
    'pagination:page': page,
    'pagination:itemsPerPage': perPage,
  });
}

// ---- Small concurrency limiter ------------------------------------------

export function limiter(concurrency, gapMs = 0) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= concurrency || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => setTimeout(() => { active--; next(); }, gapMs));
  };
  return (fn) => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); next(); });
}

// ---- Image helpers --------------------------------------------------------

export const cardImg = (base, quality = 'low', ext = 'webp') => (base ? `${base}/${quality}.${ext}` : null);
export const logoImg = (base) => (base ? `${base}.webp` : null);
export const symbolImg = (base) => (base ? `${base}.png` : null); // symbol .webp 404s on TCGdex
