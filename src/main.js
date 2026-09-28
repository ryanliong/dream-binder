import './style.css';
import * as album from './album.js';
import * as prefs from './prefs.js';
import { getCard } from './api.js';
import { fromApiCard } from './cards.js';
import { h, icon, LANG_LABEL, navState, setEnrichHook } from './ui.js';
import { cachePrice } from './price.js';
import { setsView } from './views/sets.js';
import { setView } from './views/set.js';
import { cardView } from './views/card.js';
import { searchView } from './views/search.js';
import { albumView } from './views/album.js';
import { backupView } from './views/backup.js';

const routes = [
  { re: /^\/sets\/(en|ja)$/, view: setsView, tab: 'sets' },
  { re: /^\/set\/(en|ja)\/([^/]+)$/, view: setView, tab: 'sets' },
  { re: /^\/card\/(en|ja)\/([^/]+)$/, view: cardView, tab: null },
  { re: /^\/search\/(en|ja)$/, view: searchView, tab: 'search' },
  { re: /^\/album$/, view: albumView, tab: 'album' },
  { re: /^\/backup$/, view: backupView, tab: 'backup' },
];

// ---- Shell -------------------------------------------------------------------

const app = document.getElementById('app');
const langBtns = {};
const tabs = {};
const albumCount = h('span', { class: 'count', 'aria-label': 'cards in album' });
const themeBtn = h('button', { class: 'icon-btn', type: 'button', onclick: cycleTheme });

const langToggle = h('div', { class: 'seg lang-toggle', role: 'group', 'aria-label': 'Card language' },
  ['en', 'ja'].map((l) => (langBtns[l] = h('button', { type: 'button', onclick: () => switchLang(l) }, LANG_LABEL[l]))));

const nav = h('nav', { class: 'tabbar', 'aria-label': 'Main' },
  (tabs.sets = h('a', { class: 'tab' }, icon('grid', 22), h('span', null, 'Sets'))),
  (tabs.search = h('a', { class: 'tab' }, icon('search', 22), h('span', null, 'Search'))),
  (tabs.album = h('a', { class: 'tab', href: '#/album' }, icon('book', 22), h('span', null, 'Album'), albumCount)),
  (tabs.backup = h('a', { class: 'tab', href: '#/backup' }, icon('cloud', 22), h('span', null, 'Backup'))),
);

const main = h('main', { id: 'main', tabindex: '-1' });

app.append(
  h('header', { class: 'topbar' },
    h('a', { class: 'brand', href: '#/' }, h('img', { src: `${import.meta.env.BASE_URL}favicon.svg`, alt: '', width: 26, height: 26 }), h('span', null, 'Dream Binder')),
    nav,
    h('div', { class: 'top-actions' }, langToggle, themeBtn),
  ),
  main,
);

function paintTheme() {
  const t = prefs.getTheme();
  themeBtn.replaceChildren(icon(t === 'light' ? 'sun' : t === 'dark' ? 'moon' : 'auto', 20));
  themeBtn.setAttribute('aria-label', `Theme: ${t}. Tap to change.`);
  themeBtn.title = `Theme: ${t}`;
}
function cycleTheme() {
  const order = prefs.THEMES;
  prefs.setTheme(order[(order.indexOf(prefs.getTheme()) + 1) % order.length]);
  paintTheme();
}
paintTheme();

function paintAlbumCount() {
  const n = album.count();
  albumCount.textContent = n ? String(n) : '';
  albumCount.hidden = !n;
}
album.subscribe(paintAlbumCount);
paintAlbumCount();

// Cards pinned from a grid only have brief data — fetch the full card to fill in rarity/set.
setEnrichHook((card) => {
  getCard(card.lang, card.id)
    .then((full) => {
      const key = `${card.lang}:${card.id}`;
      album.enrich(key, fromApiCard(full, card.lang));
      cachePrice(key, full.pricing, card.lang);
    })
    .catch(() => {});
});

// ---- Router ------------------------------------------------------------------

let renderId = 0;
let cleanups = [];
const scrollMemory = new Map();
let currentHash = '';

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path, query: new URLSearchParams(qs) };
}

function switchLang(lang) {
  prefs.setLang(lang);
  const { path, query } = parseHash();
  if (/^\/(sets|search)\//.test(path)) {
    const q = new URLSearchParams(query);
    q.delete('set'); // set IDs differ between languages
    q.delete('rarity');
    const qs = q.toString();
    location.hash = `${path.replace(/(en|ja)$/, lang)}${qs ? `?${qs}` : ''}`;
  } else if (/^\/(set|card)\//.test(path)) {
    location.hash = `/sets/${lang}`;
  } else {
    paintChrome(null);
  }
}

function paintChrome(routeLang, tab) {
  const lang = routeLang || prefs.getLang();
  for (const [l, b] of Object.entries(langBtns)) b.setAttribute('aria-pressed', l === lang ? 'true' : 'false');
  tabs.sets.href = `#/sets/${lang}`;
  tabs.search.href = `#/search/${lang}`;
  for (const [name, el] of Object.entries(tabs)) {
    if (name === tab) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }
}

async function render() {
  scrollMemory.set(currentHash, window.scrollY);
  currentHash = location.hash;

  const { path, query } = parseHash();
  const route = routes.find((r) => r.re.test(path));
  if (!route) {
    location.replace(`#/sets/${prefs.getLang()}`);
    return;
  }
  const [, ...params] = path.match(route.re);
  const lang = params[0] === 'en' || params[0] === 'ja' ? params[0] : null;
  if (lang) prefs.setLang(lang);
  paintChrome(lang, route.tab);

  cleanups.forEach((fn) => fn());
  cleanups = [];
  const id = ++renderId;
  const ctx = {
    lang: lang || prefs.getLang(),
    params: params.map(decodeURIComponent),
    query,
    alive: () => id === renderId,
    onCleanup: (fn) => cleanups.push(fn),
    rerender: () => render(),
  };

  main.replaceChildren();
  window.scrollTo(0, 0);
  try {
    await route.view(main, ctx);
  } catch (err) {
    console.error(err);
  }
  if (id === renderId) {
    const y = scrollMemory.get(currentHash);
    if (y) requestAnimationFrame(() => window.scrollTo(0, y));
  }
}

window.addEventListener('hashchange', () => { navState.depth++; render(); });
render();
