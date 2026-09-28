import * as album from '../album.js';
import * as sync from '../sync.js';
import { getCard, forget, limiter } from '../api.js';
import { getRates, toSGD, fmtSGD, fmtOrig } from '../fx.js';
import { getCachedPrice, cachePrice } from '../price.js';
import { getPref, setPref } from '../prefs.js';
import { h, binder, cardTile, emptyState, fmtDate, debounce } from '../ui.js';

const STALE_MS = 6 * 60 * 60 * 1000; // refresh album prices at most every 6 hours
const refreshQueue = limiter(2, 350); // gentle on the API: 2 at a time, spaced out

const SORTS = {
  added: ['Newest added', (a, b) => b.addedAt.localeCompare(a.addedAt)],
  'added-asc': ['Oldest added', (a, b) => a.addedAt.localeCompare(b.addedAt)],
  'price-desc': ['Price: high → low', null],
  'price-asc': ['Price: low → high', null],
  set: ['Set', (a, b) => (a.setName || a.setId).localeCompare(b.setName || b.setId) || numCmp(a.number, b.number)],
  name: ['Name', (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })],
};
const numCmp = (a, b) => (Number.parseInt(a, 10) || 0) - (Number.parseInt(b, 10) || 0) || String(a).localeCompare(String(b));

export async function albumView(root, ctx) {
  let sort = getPref('album.sort', 'added');
  if (!SORTS[sort]) sort = 'added';
  let langF = getPref('album.lang', 'all');
  let statusF = getPref('album.status', 'all');
  let rates = null;

  const banner = h('div');
  const stats = h('div', { class: 'stats' });
  const progress = h('p', { class: 'result-meta', 'aria-live': 'polite' });
  const grid = h('div');

  const seg = (label, options, current, onPick) => h('div', { class: 'seg', role: 'group', 'aria-label': label },
    options.map(([v, text]) => h('button', {
      type: 'button',
      'aria-pressed': v === current ? 'true' : 'false',
      onclick: (e) => {
        e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', 'false'));
        e.currentTarget.setAttribute('aria-pressed', 'true');
        onPick(v);
      },
    }, text)));

  const sortSel = h('select', { class: 'select', 'aria-label': 'Sort album', onchange: (e) => { sort = e.target.value; setPref('album.sort', sort); paint(); } },
    Object.entries(SORTS).map(([v, [label]]) => h('option', { value: v, selected: v === sort }, label)));

  root.append(
    h('div', { class: 'page-head' }, h('h1', null, 'My Album'), h('p', { class: 'muted' }, 'Your dream binder — tap a card to set Wishlist / Owned or add notes.')),
    banner,
    stats,
    h('div', { class: 'filters' },
      seg('Language', [['all', 'All'], ['en', 'EN'], ['ja', 'JP']], langF, (v) => { langF = v; setPref('album.lang', v); paint(); }),
      seg('Status', [['all', 'All'], ['wishlist', 'Wishlist'], ['owned', 'Owned']], statusF, (v) => { statusF = v; setPref('album.status', v); paint(); }),
      sortSel,
    ),
    progress,
    grid,
  );

  // ---- Storage banner ----
  const paintBanner = () => {
    const s = sync.status();
    banner.replaceChildren(s.connected
      ? h('div', { class: 'banner ok' }, h('p', null,
        `Synced to your GitHub Gist${s.login ? ` (@${s.login})` : ''}. `,
        s.lastError ? `Last sync failed: ${s.lastError}` : s.lastSyncAt ? `Last synced ${fmtDate(s.lastSyncAt, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.` : 'Syncing…'),
        h('a', { class: 'btn', href: '#/backup' }, 'Sync settings'))
      : h('div', { class: 'banner' }, h('p', null,
        h('strong', null, 'Saved in this browser only. '),
        'Clearing browser data or switching phones will lose it — export a backup or turn on Gist sync.'),
        h('a', { class: 'btn', href: '#/backup' }, 'Backup & Sync')));
  };
  paintBanner();
  const offStatus = sync.onStatus(paintBanner);
  ctx.onCleanup(offStatus);

  // ---- Prices ----
  const priceOf = (e) => {
    const p = getCachedPrice(album.keyOf(e.lang, e.id));
    if (!p || p.none) return null;
    const sgd = toSGD(p.amount, p.currency, rates);
    return sgd == null ? null : Math.round(sgd * 100) / 100; // cents, so totals match the tiles
  };

  const priceTags = new Map();

  function priceTag(e) {
    const el = h('span', { class: 'price-tag' });
    const p = getCachedPrice(album.keyOf(e.lang, e.id));
    if (!p) { el.textContent = '…'; el.classList.add('none'); }
    else if (p.none) { el.textContent = 'No price'; el.classList.add('none'); }
    else {
      const sgd = toSGD(p.amount, p.currency, rates);
      el.textContent = sgd == null ? fmtOrig(p.amount, p.currency) : fmtSGD(sgd);
      el.title = `${fmtOrig(p.amount, p.currency)} · ${p.source}`;
    }
    return el;
  }

  function paintStats() {
    const all = album.list();
    const sum = (list) => list.reduce((t, e) => t + (priceOf(e) || 0), 0);
    const owned = all.filter((e) => e.status === 'owned');
    const wish = all.filter((e) => e.status !== 'owned');
    const unpriced = all.filter((e) => priceOf(e) == null).length;
    const stat = (label, value, sub) => h('div', { class: 'stat' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), sub ? h('div', { class: 'sub' }, sub) : null);
    stats.replaceChildren(
      stat('Total value', fmtSGD(sum(all)), `${all.length} card${all.length === 1 ? '' : 's'}${unpriced ? ` · ${unpriced} without price` : ''}`),
      stat('Owned', fmtSGD(sum(owned)), `${owned.length} card${owned.length === 1 ? '' : 's'}`),
      stat('Wishlist', fmtSGD(sum(wish)), `${wish.length} card${wish.length === 1 ? '' : 's'}`),
    );
  }

  function paint() {
    const all = album.list();
    if (!all.length) {
      stats.hidden = true;
      root.querySelector('.filters').hidden = true;
      grid.replaceChildren(emptyState('Your binder is empty',
        'Browse a set and tap the ♥ on any card to add it here.',
        h('a', { class: 'btn primary', href: '#/sets/en' }, 'Browse sets')));
      return;
    }
    stats.hidden = false;
    root.querySelector('.filters').hidden = false;

    let list = all.filter((e) => (langF === 'all' || e.lang === langF) && (statusF === 'all' || e.status === statusF));
    if (sort.startsWith('price')) {
      const dir = sort === 'price-desc' ? -1 : 1;
      list = list.sort((a, b) => {
        const pa = priceOf(a); const pb = priceOf(b);
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1; // unpriced always last
        if (pb == null) return -1;
        return (pa - pb) * dir;
      });
    } else list = list.sort(SORTS[sort][1]);

    paintStats();
    priceTags.clear();
    if (!list.length) {
      grid.replaceChildren(emptyState('No cards match these filters'));
      return;
    }
    grid.replaceChildren(binder(list.map((e) => {
      const tag = priceTag(e);
      priceTags.set(album.keyOf(e.lang, e.id), tag);
      return cardTile(
        { lang: e.lang, id: e.id, name: e.name, number: e.number, image: e.image, rarity: e.rarity, setId: e.setId, setName: e.setName },
        {
          badge: h('span', { class: `status-badge ${e.status}` }, e.status === 'owned' ? 'Owned' : 'Wish'),
          extra: h('div', { class: 'cap-extra' }, h('span', { class: 'muted' }, e.lang === 'ja' ? 'JP' : 'EN'), tag),
        },
      );
    })));
  }

  const repaint = debounce(paint, 60);
  const offAlbum = album.subscribe(repaint);
  ctx.onCleanup(offAlbum);

  rates = await getRates();
  if (!ctx.alive()) return;
  paint();

  // ---- Throttled price refresh ----
  const stale = album.list().filter((e) => {
    const p = getCachedPrice(album.keyOf(e.lang, e.id));
    return !p || Date.now() - p.at > STALE_MS;
  });
  if (!stale.length) {
    progress.textContent = rates ? '' : 'Exchange rate unavailable — values shown in original currency where possible.';
    return;
  }
  let done = 0;
  const updateProgress = () => {
    progress.textContent = done < stale.length ? `Refreshing prices… ${done}/${stale.length}` : `Prices refreshed ${fmtDate(new Date().toISOString(), { hour: 'numeric', minute: '2-digit' })}.`;
  };
  updateProgress();
  const repaintStats = debounce(paintStats, 200);
  await Promise.all(stale.map((e) => refreshQueue(async () => {
    if (!ctx.alive()) return;
    const key = album.keyOf(e.lang, e.id);
    const path = `/cards/${encodeURIComponent(e.id)}`;
    try {
      forget(e.lang, path); // bypass the session cache so the price is current
      const card = await getCard(e.lang, e.id);
      cachePrice(key, card.pricing, e.lang);
      if (!ctx.alive()) return;
      const old = priceTags.get(key);
      if (old) {
        const tag = priceTag(e);
        old.replaceWith(tag);
        priceTags.set(key, tag);
      }
      repaintStats();
    } catch {
      /* keep the old cached price */
    } finally {
      done++;
      if (ctx.alive()) updateProgress();
    }
  })));
}
