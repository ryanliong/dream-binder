import * as album from '../album.js';
import { getCard, peek } from '../api.js';
import { fromApiCard } from '../cards.js';
import { getRates, toSGD, fmtSGD, fmtOrig } from '../fx.js';
import { imageSources, SOURCE_LABEL } from '../images.js';
import { headline, tcgplayerRows, cardmarketRows, pricesUpdated, priceLinks, cachePrice } from '../price.js';
import {
  h, icon, navState, cardFace, shineOnTap, isShinyRarity, errorBox, skeletonLines, fmtDate, LANG_LABEL, debounce, toast,
} from '../ui.js';

const ENERGY = {
  Grass: ['G', '#3f9b4a'], Fire: ['R', '#d9472b'], Water: ['W', '#2f7fd1'], Lightning: ['L', '#e0b020'],
  Psychic: ['P', '#8b4fb8'], Fighting: ['F', '#b0642c'], Darkness: ['D', '#2f3a44'], Metal: ['M', '#8a949c'],
  Fairy: ['Y', '#d9589b'], Dragon: ['N', '#b08d2a'], Colorless: ['C', '#b9b5ab'],
};

function energyIcons(types = []) {
  return h('span', { class: 'energy', 'aria-label': types.join(', ') },
    types.map((t) => {
      const [letter, color] = ENERGY[t] || ['?', '#888'];
      return h('i', { style: `background:${color}`, title: t }, letter);
    }));
}

export async function cardView(root, ctx) {
  const { lang } = ctx;
  const [, cardId] = ctx.params;
  const back = h('a', { class: 'back', href: `#/sets/${lang}` }, icon('back', 18), 'Back');
  const body = h('div');
  root.append(back, body);

  let card = peek(lang, `/cards/${encodeURIComponent(cardId)}`);
  if (!card) {
    body.append(h('div', { class: 'detail' },
      h('div', { class: 'detail-media' }, h('div', { class: 'detail-img' }, h('div', { class: 'card-face skeleton' }))),
      h('div', { class: 'detail-info' }, h('div', { class: 'panel' }, skeletonLines(4)), h('div', { class: 'panel' }, skeletonLines(3)))));
    try {
      card = await getCard(lang, cardId);
    } catch (err) {
      if (!ctx.alive()) return;
      body.replaceChildren(errorBox(err.status === 404 ? new Error('This card isn’t on TCGdex.') : err, ctx.rerender));
      return;
    }
    if (!ctx.alive()) return;
  }

  const c = fromApiCard(card, lang);
  const key = album.keyOf(lang, card.id);
  if (album.has(key)) {
    album.enrich(key, c);
    cachePrice(key, card.pricing, lang);
  }

  // Back goes to the previous page when there is one (keeps scroll), else to the set.
  back.href = `#/set/${lang}/${encodeURIComponent(c.setId)}`;
  back.lastChild.textContent = c.setName || 'Back';
  back.addEventListener('click', (e) => {
    if (navState.depth > 0) {
      e.preventDefault();
      history.back();
    }
  });

  document.title = `${card.name} · Dream Binder`;
  ctx.onCleanup(() => { document.title = 'Dream Binder'; });

  // ---- Image ----
  const sourceNote = h('span', { class: 'zoom-hint' });
  const shiny = isShinyRarity(card.rarity);
  const imgBtn = h('button', { class: 'detail-img card', type: 'button', 'aria-label': 'Zoom card image' },
    cardFace(c, {
      quality: 'high',
      eager: true,
      onSource: (src) => {
        sourceNote.textContent = src === 'none' ? 'No image available yet' : `Tap to zoom · Image: ${SOURCE_LABEL[src]}`;
        imgBtn.disabled = src === 'none';
      },
    }));
  if (shiny) { imgBtn.dataset.rare = ''; shineOnTap(imgBtn); }
  imgBtn.addEventListener('click', () => openZoom(c, imgBtn.querySelector('.card-face').dataset.source));

  // ---- Title ----
  const title = h('div', { class: 'title-row' },
    h('h1', null, card.name),
    h('p', { class: 'muted' },
      h('span', { class: 'chip' }, LANG_LABEL[lang]), ' ',
      [c.setName, `#${card.localId}${card.set?.cardCount?.official ? `/${card.set.cardCount.official}` : ''}`, card.rarity].filter(Boolean).join(' · ')),
  );

  // ---- Prices (render once FX resolves) ----
  const pricePanel = h('section', { class: 'panel' }, h('h2', null, 'Market price'), skeletonLines(2));
  renderPrices(pricePanel, card, c, lang, ctx);

  body.replaceChildren(h('div', { class: 'detail' },
    h('div', { class: 'detail-media' }, imgBtn, sourceNote),
    h('div', { class: 'detail-info' },
      title,
      albumPanel(c, card, lang),
      pricePanel,
      detailsPanel(card, c),
      movesPanel(card),
      card.description ? h('section', { class: 'panel' }, h('h2', null, 'Flavour text'), h('p', { class: 'muted' }, card.description)) : null,
    ),
  ));
}

// ---- Album controls ------------------------------------------------------------

function albumPanel(c, card, lang) {
  const key = album.keyOf(lang, card.id);
  const panel = h('section', { class: 'panel album-panel' });

  function paint() {
    const entry = album.get(key);
    if (!entry) {
      panel.replaceChildren(
        h('button', { class: 'btn primary', type: 'button', onclick: () => {
          album.add(c);
          cachePrice(key, card.pricing, lang);
          toast(`Added ${c.name} to your album`);
        } }, icon('heart', 18), 'Add to album'),
      );
      return;
    }
    const seg = h('div', { class: 'seg status', role: 'group', 'aria-label': 'Status' },
      [['wishlist', 'Wishlist'], ['owned', 'Owned']].map(([v, label]) =>
        h('button', { type: 'button', dataset: { v }, 'aria-pressed': entry.status === v ? 'true' : 'false', onclick: () => album.update(key, { status: v }) }, label)));
    const notes = h('textarea', { class: 'input', id: 'notes', rows: 2, placeholder: 'Notes — e.g. want PSA 10, trade target…', maxlength: 500 });
    notes.value = entry.notes || '';
    notes.addEventListener('input', debounce(() => album.update(key, { notes: notes.value }), 400));
    panel.replaceChildren(
      h('div', { class: 'btn-row', style: 'align-items:center;justify-content:space-between' },
        h('div', { class: 'sync-status' }, icon('heart', 18), 'In your album'),
        seg),
      h('div', { class: 'field' }, h('label', { for: 'notes' }, 'Notes'), notes),
      h('div', { class: 'btn-row', style: 'justify-content:space-between;align-items:center' },
        h('span', { class: 'muted', style: 'font-size:.82rem' }, `Added ${fmtDate(entry.addedAt)}`),
        h('button', { class: 'btn danger', type: 'button', onclick: () => { album.remove(key); toast(`Removed ${c.name}`); } }, 'Remove')),
    );
  }

  paint();
  // Repaint on status change or removal, but not while typing notes.
  const unsub = album.subscribe(() => {
    if (!panel.isConnected) return unsub();
    if (document.activeElement?.id === 'notes' && album.has(key)) {
      panel.querySelectorAll('.seg button').forEach((b) =>
        b.setAttribute('aria-pressed', album.get(key).status === b.dataset.v ? 'true' : 'false'));
      return;
    }
    paint();
  });
  return panel;
}

// ---- Prices ----------------------------------------------------------------------

async function renderPrices(panel, card, c, lang, ctx) {
  const rates = await getRates();
  if (!ctx.alive()) return;
  const p = card.pricing;
  const head = headline(p, lang);
  const tcg = tcgplayerRows(p);
  const cm = cardmarketRows(p);
  const conv = (n, cur) => {
    const s = toSGD(n, cur, rates);
    return s == null ? fmtOrig(n, cur) : fmtSGD(s);
  };
  const cell = (n, cur) => (n == null ? h('td', null, '—') : h('td', null, conv(n, cur), rates ? h('span', { class: 'orig' }, fmtOrig(n, cur)) : null));

  const parts = [h('h2', null, 'Market price')];
  if (head) {
    const sgd = toSGD(head.amount, head.currency, rates);
    parts.push(
      h('div', { class: 'price-big' }, sgd == null ? fmtOrig(head.amount, head.currency) : fmtSGD(sgd)),
      h('div', { class: 'price-sub' }, `${fmtOrig(head.amount, head.currency)} · ${head.source} ${head.detail}`),
    );
  } else {
    parts.push(
      h('div', { class: 'price-big none', style: 'font-size:1.2rem;color:var(--muted)' }, 'No price data'),
      h('div', { class: 'price-sub' }, lang === 'ja'
        ? 'Japanese cards often aren’t tracked by TCGplayer or Cardmarket. Try the marketplace searches below.'
        : 'Neither TCGplayer nor Cardmarket has a price for this card. Try the searches below.'),
    );
  }

  if (tcg.length) {
    parts.push(h('div', { class: 'price-table-wrap' }, h('table', { class: 'price-table' },
      h('thead', null, h('tr', null, h('th', null, 'TCGplayer'), h('th', null, 'Market'), h('th', null, 'Low'), h('th', null, 'Mid'), h('th', null, 'High'))),
      h('tbody', null, tcg.map((r) => h('tr', null, h('td', null, r.label), cell(r.market, 'USD'), cell(r.low, 'USD'), cell(r.mid, 'USD'), cell(r.high, 'USD')))))));
  }
  if (cm.length) {
    parts.push(h('div', { class: 'price-table-wrap' }, h('table', { class: 'price-table' },
      h('thead', null, h('tr', null, h('th', null, 'Cardmarket'), h('th', null, 'Trend'), h('th', null, 'Avg'), h('th', null, '30-day'), h('th', null, 'Low'))),
      h('tbody', null, cm.map((r) => h('tr', null, h('td', null, r.label), cell(r.trend, 'EUR'), cell(r.avg, 'EUR'), cell(r.avg30, 'EUR'), cell(r.low, 'EUR')))))));
  }

  parts.push(h('div', { class: 'links' }, priceLinks(c, p).map((l) =>
    h('a', { class: 'btn', href: l.href, target: '_blank', rel: 'noopener noreferrer' }, l.label, icon('external', 14)))));

  const updated = pricesUpdated(p);
  const fxLine = rates
    ? `1 USD = S$${rates.USD.toFixed(4)} · 1 EUR = S$${rates.EUR.toFixed(4)} · ECB rate of ${fmtDate(rates.date)}, fetched ${fmtDate(new Date(rates.fetchedAt).toISOString(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}${rates.stale ? ' (offline — using last saved rate)' : ''}`
    : 'Exchange rate unavailable — showing original currencies.';
  parts.push(h('p', { class: 'fx-note' }, [updated ? `Prices updated ${fmtDate(updated)}. ` : '', fxLine].join('')));

  panel.replaceChildren(...parts);
}

// ---- Details ---------------------------------------------------------------------

function detailsPanel(card, c) {
  const fact = (label, value) => (value == null || value === '' || (Array.isArray(value) && !value.length)
    ? null
    : h('div', null, h('dt', null, label), h('dd', null, value)));
  const wr = (arr) => arr?.length ? arr.map((w) => `${w.type} ${w.value ?? ''}`.trim()).join(', ') : null;

  return h('section', { class: 'panel' },
    h('h2', null, 'Details'),
    h('dl', { class: 'facts' },
      fact('Set', h('a', { href: `#/set/${c.lang}/${encodeURIComponent(c.setId)}` }, c.setName || c.setId)),
      fact('Number', `${card.localId}${card.set?.cardCount?.official ? ` / ${card.set.cardCount.official}` : ''}`),
      fact('Rarity', card.rarity),
      fact('Category', card.category),
      fact('HP', card.hp),
      fact('Type', card.types?.length ? h('span', null, energyIcons(card.types), ' ', card.types.join(', ')) : null),
      fact('Stage', card.stage),
      fact('Evolves from', card.evolveFrom),
      fact('Trainer type', card.trainerType),
      fact('Energy type', card.energyType),
      fact('Weakness', wr(card.weaknesses)),
      fact('Resistance', wr(card.resistances)),
      fact('Retreat', card.retreat != null ? h('span', null, energyIcons(Array(card.retreat).fill('Colorless')), card.retreat === 0 ? '0' : '') : null),
      fact('Illustrator', card.illustrator),
      fact('Regulation', card.regulationMark),
      fact('Pokédex', card.dexId?.length ? card.dexId.map((n) => `#${n}`).join(', ') : null),
      fact('Card ID', card.id),
    ),
  );
}

function movesPanel(card) {
  const abilities = card.abilities || [];
  const attacks = card.attacks || [];
  if (!abilities.length && !attacks.length && !card.effect) return null;
  return h('section', { class: 'panel' },
    h('h2', null, card.category === 'Pokemon' ? 'Abilities & attacks' : 'Effect'),
    card.effect ? h('div', { class: 'move' }, h('p', null, card.effect)) : null,
    abilities.map((a) => h('div', { class: 'move' },
      h('div', { class: 'move-head' }, h('span', { class: 'tag-ability' }, a.type || 'Ability'), a.name),
      a.effect ? h('p', null, a.effect) : null)),
    attacks.map((a) => h('div', { class: 'move' },
      h('div', { class: 'move-head' }, energyIcons(a.cost), a.name, a.damage != null ? h('span', { class: 'dmg' }, a.damage) : null),
      a.effect ? h('p', null, a.effect) : null)),
  );
}

// ---- Zoom overlay -------------------------------------------------------------------

function openZoom(c, loadedSource) {
  // Full-size image from whichever source actually loaded.
  const src = imageSources(c, 'zoom').find((s) => s.source === loadedSource)?.src;
  if (!src) return;
  const prevFocus = document.activeElement;
  const img = h('img', { src, alt: `${c.name} — full size` });
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    prevFocus?.focus?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const closeBtn = h('button', { class: 'zoom-close', type: 'button', 'aria-label': 'Close', onclick: close }, icon('close', 22));
  const overlay = h('div', { class: 'zoom', role: 'dialog', 'aria-modal': 'true', 'aria-label': `${c.name} image`,
    onclick: (e) => { if (e.target === overlay) close(); } }, closeBtn, img);
  img.addEventListener('click', () => overlay.classList.toggle('big'));
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.append(overlay);
  closeBtn.focus();
}
