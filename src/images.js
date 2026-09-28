// Card image sources, tried in order: TCGdex → Limitless TCG (Japanese only) → placeholder.
//
// TCGdex is missing images for ~70% of Japanese cards (all Mega / SV11 / S / SM eras).
// Limitless TCG hosts JP scans under the same set codes: tpc/{SET}/{SET}_{n}_R_JP_{SM|LG}.png
// with an unpadded card number. It's not an official API, so it may change — the
// placeholder is always the last resort.

const LIMITLESS = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc';

export const SOURCE_LABEL = { tcgdex: 'TCGdex', limitless: 'Limitless TCG' };

/** quality: "low" (grid) | "high" (detail) | "zoom" (full-size) */
export function imageSources(card, quality = 'low') {
  const out = [];
  if (card.image) {
    const file = quality === 'low' ? 'low.webp' : quality === 'high' ? 'high.webp' : 'high.png';
    out.push({ src: `${card.image}/${file}`, source: 'tcgdex' });
  }
  if (card.lang === 'ja' && card.setId && card.number) {
    const n = /^\d+$/.test(card.number) ? String(Number.parseInt(card.number, 10)) : card.number;
    const size = quality === 'low' ? 'SM' : 'LG';
    const set = encodeURIComponent(card.setId);
    out.push({ src: `${LIMITLESS}/${set}/${set}_${encodeURIComponent(n)}_R_JP_${size}.png`, source: 'limitless' });
  }
  return out;
}
