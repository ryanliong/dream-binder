import { getSets, getRarities, searchCards, RARITY_PRESETS } from '../api.js';
import { fromBrief, setIdFromCardId } from '../cards.js';
import { h, icon, binder, cardTile, skeletonGrid, errorBox, emptyState } from '../ui.js';

const PER_PAGE = 60;

export async function searchView(root, ctx) {
  const { lang, query } = ctx;
  const q = (query.get('q') || '').trim();
  const setId = query.get('set') || '';
  const rarity = query.get('rarity') || '';

  const input = h('input', {
    class: 'input', type: 'search', name: 'q', value: q, enterkeyhint: 'search', autocomplete: 'off',
    placeholder: lang === 'ja' ? 'Card name in Japanese, e.g. ピカチュウ' : 'Card name, e.g. Charizard',
    'aria-label': 'Card name',
  });
  const setSel = h('select', { class: 'select', name: 'set', 'aria-label': 'Set' }, h('option', { value: '' }, 'All sets'));
  const rarSel = h('select', { class: 'select', name: 'rarity', 'aria-label': 'Rarity' }, h('option', { value: '' }, 'Any rarity'));
  const form = h('form', { class: 'search-form', role: 'search' },
    h('div', { class: 'search-row' }, input, h('button', { class: 'btn primary', type: 'submit' }, icon('search', 18), 'Search')),
    h('div', { class: 'search-row' }, setSel, rarSel),
  );
  const results = h('div');

  root.append(
    h('div', { class: 'page-head' },
      h('h1', null, lang === 'ja' ? 'Search Japanese cards' : 'Search English cards'),
      h('p', { class: 'muted' }, lang === 'ja'
        ? 'Japanese names are in katakana (ピカチュウ, リザードン). Or pick a set and rarity to browse.'
        : 'Search by name, or pick a set and rarity to browse.')),
    form,
    results,
  );

  const submit = () => {
    const p = new URLSearchParams();
    if (input.value.trim()) p.set('q', input.value.trim());
    if (setSel.value) p.set('set', setSel.value);
    if (rarSel.value) p.set('rarity', rarSel.value);
    const next = `#/search/${lang}${p.toString() ? `?${p}` : ''}`;
    if (next === location.hash) ctx.rerender();
    else location.hash = next;
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); input.blur(); submit(); });
  setSel.addEventListener('change', submit);
  rarSel.addEventListener('change', submit);

  // Filter options load in the background; the search itself doesn't wait for them.
  let setNames = new Map();
  const optionsReady = Promise.allSettled([getSets(lang), getRarities(lang)]).then(([sets, rarities]) => {
    if (sets.status === 'fulfilled') {
      setNames = new Map(sets.value.map((s) => [s.id, s.name]));
      setSel.append(...sets.value.filter((s) => s.cardCount?.total).map((s) => h('option', { value: s.id, selected: s.id === setId }, `${s.name} (${s.id})`)));
    }
    if (rarities.status === 'fulfilled') {
      rarSel.append(
        h('optgroup', { label: 'Collections' },
          Object.entries(RARITY_PRESETS).map(([v, p]) => h('option', { value: v, selected: v === rarity }, p.label))),
        h('optgroup', { label: 'TCGdex rarity' },
          rarities.value.filter((r) => r !== 'None').map((r) => h('option', { value: r, selected: r === rarity },
            r === 'Full Art Trainer' ? 'Full Art Trainer (TCGdex tag — 6 cards only)' : r))),
      );
    }
    setSel.value = setId;
    rarSel.value = rarity;
  });

  if (!q && !setId && !rarity) {
    results.append(emptyState('Find a card', 'Type a name above — results show as a binder page you can add from.'));
    if (!input.value) setTimeout(() => input.focus({ preventScroll: true }), 50);
    return;
  }
  if (q && q.length < 2 && !setId) {
    results.append(emptyState('Type at least 2 characters'));
    return;
  }

  let page = 1;
  const meta = h('p', { class: 'result-meta', 'aria-live': 'polite' });
  const more = h('div', { class: 'more' });
  const pageHost = h('div');
  results.append(meta, pageHost, more);
  pageHost.append(skeletonGrid(9));

  const tiles = [];
  async function load() {
    let list;
    try {
      list = await searchCards(lang, { name: q, setId, rarity, page, perPage: PER_PAGE });
    } catch (err) {
      if (!ctx.alive()) return;
      if (page === 1) pageHost.replaceChildren(errorBox(err, ctx.rerender));
      else more.replaceChildren(errorBox(err, () => { more.replaceChildren(); load(); }));
      return;
    }
    await optionsReady;
    if (!ctx.alive()) return;

    for (const c of list) {
      const sid = setIdFromCardId(c.id, c.localId);
      const card = fromBrief(c, lang, { id: sid, name: setNames.get(sid) || sid });
      const preset = RARITY_PRESETS[rarity];
      if (rarity && !preset) card.rarity = rarity; // known from the filter → enables holo shimmer
      tiles.push(cardTile(card, preset ? { shiny: true } : undefined));
    }
    if (!tiles.length) {
      pageHost.replaceChildren(emptyState('No cards found',
        lang === 'ja' && /^[\x00-\x7F]+$/.test(q)
          ? 'Japanese card names are in Japanese — try katakana (e.g. ピカチュウ), or switch to EN.'
          : 'Try a shorter name or remove a filter.'));
      meta.textContent = '';
      more.replaceChildren();
      return;
    }
    pageHost.replaceChildren(binder(tiles));
    const hasMore = list.length === PER_PAGE;
    meta.textContent = `${tiles.length}${hasMore ? '+' : ''} card${tiles.length === 1 ? '' : 's'}`;
    more.replaceChildren(...(hasMore
      ? [h('button', { class: 'btn', type: 'button', onclick: (e) => { e.currentTarget.disabled = true; e.currentTarget.textContent = 'Loading…'; page++; load(); } }, 'Load more')]
      : []));
  }
  await load();
}
