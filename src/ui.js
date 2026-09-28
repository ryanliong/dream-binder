// Tiny DOM helpers + shared components. Everything user- or API-provided goes through
// text nodes / attributes (never innerHTML), so card names can't inject markup.

import * as album from './album.js';
import { cardImg } from './api.js';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  heart: 'M12 20.3l-1.2-1.1C6.3 15.1 3.3 12.4 3.3 9 3.3 6.3 5.4 4.2 8.1 4.2c1.5 0 3 .7 3.9 1.9.9-1.2 2.4-1.9 3.9-1.9 2.7 0 4.8 2.1 4.8 4.8 0 3.4-3 6.1-7.5 10.2L12 20.3z',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  search: 'M10.5 4a6.5 6.5 0 015.2 10.4l4.4 4.4-1.4 1.4-4.4-4.4A6.5 6.5 0 1110.5 4zm0 2a4.5 4.5 0 100 9 4.5 4.5 0 000-9z',
  book: 'M5 3h11a3 3 0 013 3v15H7a2 2 0 01-2-2V3zm2 2v12.2c.3-.1.6-.2 1-.2h9V6a1 1 0 00-1-1H7zm1 14a.5.5 0 000 1h9v-1H8z',
  cloud: 'M7 19a5 5 0 01-.9-9.9A6 6 0 0117.7 8 4.5 4.5 0 0117.5 19H7zm5-10l-4 4h3v4h2v-4h3l-4-4z',
  sun: 'M12 7a5 5 0 110 10 5 5 0 010-10zM11 1h2v3h-2zM11 20h2v3h-2zM1 11h3v2H1zM20 11h3v2h-3zM4.2 2.8l2.1 2.1-1.4 1.4-2.1-2.1zM17.7 18.1l2.1 2.1-1.4 1.4-2.1-2.1zM2.8 19.8l2.1-2.1 1.4 1.4-2.1 2.1zM18.1 6.3l2.1-2.1 1.4 1.4-2.1 2.1z',
  moon: 'M20 15.3A8.5 8.5 0 018.7 4a8.5 8.5 0 1011.3 11.3z',
  auto: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 2v14a7 7 0 010-14z',
  back: 'M15.4 4.6L8 12l7.4 7.4-1.4 1.4L5.2 12 14 3.2z',
  close: 'M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z',
  external: 'M14 3h7v7h-2V6.4l-9.3 9.3-1.4-1.4L17.6 5H14zM5 5h6v2H5v12h12v-6h2v8H3V5z',
  retry: 'M12 4a8 8 0 017.7 6h-2.1A6 6 0 1012 18a6 6 0 005.3-3.2l1.8.9A8 8 0 1112 4zm5-1l4 4-4 4z',
};

export function icon(name, size = 20) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon icon-${name}`);
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[name]);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

export const LANG_LABEL = { en: 'EN', ja: 'JP' };

export function fmtDate(iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-SG', opts);
}

// ---- Rarity → holo shimmer ------------------------------------------------

const SHINY = /holo|ultra|secret|illustration|hyper|shiny|special|amazing|radiant|crown|star|double|triple|mega|character|full art|ace spec|legend|prime|lv\.x|vmax|vstar|gold/i;
export const isShinyRarity = (rarity) => !!rarity && SHINY.test(rarity);

// ---- Card face (image or placeholder) ---------------------------------------

export function placeholder({ name, number, setName, lang }) {
  return h('div', { class: 'placeholder', role: 'img', 'aria-label': `${name} (no image available)` },
    h('span', { class: 'ph-lang' }, LANG_LABEL[lang] || ''),
    h('span', { class: 'ph-name' }, name || 'Unknown card'),
    number ? h('span', { class: 'ph-num' }, `#${number}`) : null,
    setName ? h('span', { class: 'ph-set' }, setName) : null,
    h('span', { class: 'ph-note' }, 'No image yet'),
  );
}

export function cardFace(card, { quality = 'low', eager = false } = {}) {
  const face = h('div', { class: 'card-face' });
  const src = cardImg(card.image, quality);
  if (src) {
    const img = h('img', {
      src,
      alt: `${card.name} #${card.number}`,
      loading: eager ? 'eager' : 'lazy',
      decoding: 'async',
      onload: () => face.classList.add('loaded'),
      onerror: () => img.replaceWith(placeholder(card)),
    });
    face.append(img);
  } else {
    face.append(placeholder(card));
    face.classList.add('loaded');
  }
  face.append(h('span', { class: 'holo', 'aria-hidden': 'true' }));
  return face;
}

// Tap-to-shine on touch devices (hover handles desktop).
export function shineOnTap(el) {
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    el.classList.remove('shine');
    void el.offsetWidth;
    el.classList.add('shine');
    setTimeout(() => el.classList.remove('shine'), 1200);
  }, { passive: true });
}

// ---- Album pin button (one-tap add/remove) ------------------------------------

export function pinButton(card) {
  const key = album.keyOf(card.lang, card.id);
  const btn = h('button', {
    class: 'pin',
    type: 'button',
    dataset: { albumKey: key },
    onclick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      const added = album.toggle(card);
      toast(added ? `Added ${card.name} to your album` : `Removed ${card.name}`);
      if (added) enrichLater(card);
    },
  }, icon('heart', 18));
  syncPin(btn);
  return btn;
}

function syncPin(btn) {
  const on = album.has(btn.dataset.albumKey);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.setAttribute('aria-label', on ? 'Remove from album' : 'Add to album');
  btn.title = on ? 'In your album — tap to remove' : 'Add to album';
}

export function refreshPins(root = document) {
  root.querySelectorAll('[data-album-key]').forEach(syncPin);
}
album.subscribe(() => refreshPins());

// Grid data is brief (no rarity) — fetch the full card once to fill the entry in.
let enrichHook = null;
export const setEnrichHook = (fn) => { enrichHook = fn; };
function enrichLater(card) { enrichHook?.(card); }

// ---- Card tile ---------------------------------------------------------------

/**
 * card: { lang, id, name, number, image, rarity?, setId?, setName? }
 * opts.shiny: force holo shimmer; opts.extra: nodes appended under the caption.
 */
export function cardTile(card, { shiny, extra, badge } = {}) {
  const href = `#/card/${card.lang}/${encodeURIComponent(card.id)}`;
  const link = h('a', { class: 'card', href, 'aria-label': `${card.name} #${card.number}` }, cardFace(card));
  if (shiny ?? isShinyRarity(card.rarity)) {
    link.dataset.rare = '';
    shineOnTap(link);
  }
  return h('div', { class: 'slot' },
    link,
    badge || null,
    pinButton(card),
    h('div', { class: 'cap' },
      h('span', { class: 'cap-name' }, card.name),
      h('span', { class: 'cap-num' }, card.number ? `#${card.number}` : ''),
    ),
    extra || null,
  );
}

export function binder(children, cls = '') {
  return h('div', { class: `binder ${cls}` }, children);
}

// ---- Loading / error states -----------------------------------------------------

export function skeletonGrid(n = 9) {
  return binder(Array.from({ length: n }, () =>
    h('div', { class: 'slot' }, h('div', { class: 'card-face skeleton' }), h('div', { class: 'cap' }, h('span', { class: 'skeleton-line' })))));
}

export function skeletonLines(n = 3) {
  return h('div', { class: 'sk-lines' }, Array.from({ length: n }, (_, i) =>
    h('span', { class: 'skeleton-line', style: `width:${90 - i * 18}%` })));
}

export function errorBox(err, onRetry) {
  return h('div', { class: 'error-box', role: 'alert' },
    h('strong', null, 'Something went wrong'),
    h('p', null, err?.message || String(err)),
    onRetry ? h('button', { class: 'btn', type: 'button', onclick: onRetry }, icon('retry', 18), 'Try again') : null,
  );
}

export function emptyState(title, body, action) {
  return h('div', { class: 'empty' }, h('strong', null, title), body ? h('p', null, body) : null, action || null);
}

// ---- Toast ------------------------------------------------------------------------

let toastTimer;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ---- Misc ----------------------------------------------------------------------------

export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Two-tap confirmation built into a button (no native confirm()). */
export function confirmButton(label, confirmLabel, onConfirm, cls = 'btn danger') {
  let armed = false;
  let timer;
  const btn = h('button', { class: cls, type: 'button', onclick: () => {
    if (!armed) {
      armed = true;
      btn.textContent = confirmLabel;
      btn.classList.add('armed');
      timer = setTimeout(reset, 4000);
      return;
    }
    reset();
    onConfirm();
  } }, label);
  function reset() {
    clearTimeout(timer);
    armed = false;
    btn.textContent = label;
    btn.classList.remove('armed');
  }
  return btn;
}
