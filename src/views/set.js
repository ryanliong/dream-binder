import { getSet, peekSet, logoImg, symbolImg } from '../api.js';
import { fromBrief } from '../cards.js';
import { h, icon, binder, cardTile, skeletonGrid, errorBox, emptyState, fmtDate, LANG_LABEL } from '../ui.js';

export async function setView(root, ctx) {
  const { lang } = ctx;
  const [, setId] = ctx.params;
  const back = h('a', { class: 'back', href: `#/sets/${lang}` }, icon('back', 18), 'All sets');
  const head = h('div', { class: 'set-head' }, h('h1', null, setId));
  const body = h('div');
  root.append(back, head, body);

  let set = peekSet(lang, setId);
  if (!set) {
    body.append(skeletonGrid(12));
    try {
      set = await getSet(lang, setId);
    } catch (err) {
      if (!ctx.alive()) return;
      body.replaceChildren(errorBox(err, ctx.rerender));
      return;
    }
    if (!ctx.alive()) return;
  }

  const official = set.cardCount?.official ?? 0;
  const cards = set.cards || [];
  const withImages = cards.filter((c) => c.image).length;
  const logo = logoImg(set.logo) || symbolImg(set.symbol);

  head.replaceChildren(...[
    logo ? h('img', { class: 'set-head-logo', src: logo, alt: '', onerror: (e) => e.target.remove() }) : null,
    h('div', null,
      h('h1', null, set.name),
      h('p', { class: 'muted' },
        [
          LANG_LABEL[lang],
          set.serie?.name,
          set.releaseDate ? `Released ${fmtDate(set.releaseDate)}` : null,
          `${cards.length} cards`,
        ].filter(Boolean).join(' · '),
      ),
      cards.length > 0 && withImages < cards.length
        ? h('p', { class: 'note' }, lang === 'ja'
          ? `TCGdex is missing ${withImages === 0 ? 'all' : cards.length - withImages} images here, so they're loaded from Limitless TCG. Any still missing show as placeholders.`
          : `${cards.length - withImages} cards have no image yet and show as placeholders.`)
        : null,
    ),
  ].filter(Boolean));
  document.title = `${set.name} · Dream Binder`;
  ctx.onCleanup(() => { document.title = 'Dream Binder'; });

  if (!cards.length) {
    body.replaceChildren(emptyState('No cards listed yet', 'TCGdex hasn’t published the card list for this set.'));
    return;
  }

  const setRef = { id: set.id, name: set.name };
  body.replaceChildren(binder(cards.map((c) => {
    const num = Number.parseInt(c.localId, 10);
    // Numbers past the official count are secret / illustration rares → holo shimmer.
    const secret = official > 0 && Number.isFinite(num) && num > official;
    return cardTile(fromBrief(c, lang, setRef), { shiny: secret });
  })));
}
