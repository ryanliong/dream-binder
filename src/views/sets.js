import { getSets, peekSets, getSet, peekSet, limiter, logoImg, symbolImg } from '../api.js';
import { h, errorBox, fmtDate, LANG_LABEL, debounce } from '../ui.js';

// /sets doesn't include release dates, so each tile fetches its set detail when it
// scrolls into view (a few at a time). Those responses are cached, so opening the set
// afterwards is instant.
const detailQueue = limiter(4, 50);

export async function setsView(root, ctx) {
  const { lang } = ctx;
  const filter = h('input', {
    class: 'input',
    type: 'search',
    placeholder: lang === 'ja' ? 'Filter sets (e.g. SV8a, テラスタル)' : 'Filter sets (e.g. Surging Sparks)',
    'aria-label': 'Filter sets',
    value: ctx.query.get('q') || '',
  });
  const list = h('div', { class: 'set-grid', 'aria-busy': 'true' });

  root.append(
    h('div', { class: 'page-head' },
      h('h1', null, lang === 'ja' ? 'Japanese sets' : 'English sets'),
      h('p', { class: 'muted' }, 'Newest first. Tap a set to open its binder.'),
    ),
    h('div', { class: 'toolbar' }, filter),
    list,
  );

  let sets = peekSets(lang);
  if (!sets) {
    list.append(...Array.from({ length: 8 }, () => h('div', { class: 'set-tile skeleton-tile' })));
    try {
      sets = await getSets(lang);
    } catch (err) {
      if (!ctx.alive()) return;
      list.replaceChildren(errorBox(err, ctx.rerender));
      return;
    }
    if (!ctx.alive()) return;
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      loadDetail(e.target);
    }
  }, { rootMargin: '300px 0px' });
  ctx.onCleanup(() => io.disconnect());

  const tiles = sets.map((s) => {
    const tile = setTile(s, lang);
    const cached = peekSet(lang, s.id);
    if (cached) fillDetail(tile, cached);
    else io.observe(tile);
    return tile;
  });

  function loadDetail(tile) {
    detailQueue(() => (ctx.alive() ? getSet(lang, tile.dataset.id) : null))
      .then((d) => d && fillDetail(tile, d))
      .catch(() => { tile.querySelector('.set-date').textContent = ''; });
  }

  const applyFilter = () => {
    const q = filter.value.trim().toLowerCase();
    let shown = 0;
    for (const t of tiles) {
      const match = !q || t.dataset.search.includes(q);
      t.hidden = !match;
      if (match) shown++;
    }
    empty.hidden = shown > 0;
  };
  const empty = h('p', { class: 'muted empty-inline', hidden: true }, 'No sets match that filter.');

  list.replaceChildren(...tiles, empty);
  list.removeAttribute('aria-busy');
  filter.addEventListener('input', debounce(() => {
    applyFilter();
    history.replaceState(null, '', `#/sets/${lang}${filter.value ? `?q=${encodeURIComponent(filter.value)}` : ''}`);
  }, 120));
  applyFilter();
}

function setTile(s, lang) {
  const art = h('div', { class: 'set-art' });
  const logo = logoImg(s.logo);
  const symbol = symbolImg(s.symbol);
  const fallback = () => art.replaceChildren(h('span', { class: 'set-code' }, s.id));
  if (logo || symbol) {
    art.append(h('img', {
      src: logo || symbol,
      alt: '',
      loading: 'lazy',
      decoding: 'async',
      class: logo ? 'set-logo' : 'set-symbol',
      onerror: (e) => {
        if (logo && symbol && e.target.src !== symbol) {
          e.target.className = 'set-symbol';
          e.target.src = symbol;
        } else fallback();
      },
    }));
  } else fallback();

  const total = s.cardCount?.total ?? 0;
  const official = s.cardCount?.official ?? 0;
  const secret = total > official && official > 0 ? total - official : 0;

  return h('a', {
    class: `set-tile${total ? '' : ' is-empty'}`,
    href: `#/set/${lang}/${encodeURIComponent(s.id)}`,
    dataset: { id: s.id, search: `${s.name} ${s.id}`.toLowerCase() },
  },
    art,
    h('div', { class: 'set-info' },
      h('span', { class: 'set-name' }, s.name),
      h('span', { class: 'set-meta' },
        h('span', { class: 'set-date' }, h('span', { class: 'skeleton-line short' })),
        h('span', { class: 'dot' }, '·'),
        h('span', null, total ? `${total} cards${secret ? ` (${secret} secret)` : ''}` : 'No card list yet'),
      ),
      h('span', { class: 'set-series' }, h('span', { class: 'chip' }, LANG_LABEL[lang]), ' ', h('span', { class: 'set-id' }, s.id)),
    ),
  );
}

function fillDetail(tile, d) {
  tile.querySelector('.set-date').textContent = d.releaseDate ? fmtDate(d.releaseDate) : 'Date unknown';
  if (d.serie?.name) {
    tile.querySelector('.set-id').textContent = `${d.id} · ${d.serie.name}`;
    tile.dataset.search += ` ${d.serie.name.toLowerCase()}`;
  }
}
