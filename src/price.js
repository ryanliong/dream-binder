// Reading TCGdex `pricing` objects, plus a local cache of each album card's headline price.
//
// pricing.tcgplayer:  { unit: "USD", updated, holofoil|normal|reverse-holofoil|…: { lowPrice, midPrice, highPrice, marketPrice, … } }
// pricing.cardmarket: { unit: "EUR", updated, avg, low, trend, avg1, avg7, avg30, "trend-holo", … }

const TCG_ORDER = [
  'holofoil', 'normal', 'reverse-holofoil',
  '1st-edition-holofoil', '1st-edition-normal', '1st-edition',
  'unlimited-holofoil', 'unlimited-normal', 'unlimited',
];
const TCG_LABEL = {
  holofoil: 'Holofoil', normal: 'Normal', 'reverse-holofoil': 'Reverse holo',
  '1st-edition-holofoil': '1st Ed. holo', '1st-edition-normal': '1st Ed.', '1st-edition': '1st Ed.',
  'unlimited-holofoil': 'Unlimited holo', 'unlimited-normal': 'Unlimited', unlimited: 'Unlimited',
};

const pos = (n) => (typeof n === 'number' && n > 0 ? n : null);

export function tcgplayerRows(pricing) {
  const t = pricing?.tcgplayer;
  if (!t) return [];
  const keys = Object.keys(t).filter((k) => t[k] && typeof t[k] === 'object');
  keys.sort((a, b) => (TCG_ORDER.indexOf(a) + 1 || 99) - (TCG_ORDER.indexOf(b) + 1 || 99));
  return keys
    .map((k) => ({
      variant: k,
      label: TCG_LABEL[k] || k.replace(/-/g, ' '),
      market: pos(t[k].marketPrice),
      low: pos(t[k].lowPrice),
      mid: pos(t[k].midPrice),
      high: pos(t[k].highPrice),
      productId: t[k].productId,
    }))
    .filter((r) => r.market || r.low || r.mid || r.high);
}

export function cardmarketRows(pricing) {
  const c = pricing?.cardmarket;
  if (!c) return [];
  const rows = [];
  const normal = { label: 'Normal', trend: pos(c.trend), avg: pos(c.avg), avg30: pos(c.avg30), low: pos(c.low) };
  if (normal.trend || normal.avg || normal.avg30 || normal.low) rows.push(normal);
  const holo = { label: 'Holo / reverse', trend: pos(c['trend-holo']), avg: pos(c['avg-holo']), avg30: pos(c['avg30-holo']), low: pos(c['low-holo']) };
  if (holo.trend || holo.avg || holo.avg30 || holo.low) rows.push(holo);
  return rows;
}

/**
 * One representative price for a card: TCGplayer market (USD) for English cards,
 * Cardmarket trend (EUR) for Japanese — falling back to whichever exists.
 */
export function headline(pricing, lang) {
  const tcg = () => {
    const r = tcgplayerRows(pricing)[0];
    const amount = r && (r.market || r.mid || r.low);
    return amount ? { amount, currency: 'USD', source: 'TCGplayer', detail: `${r.market ? 'market' : r.mid ? 'mid' : 'low'} · ${r.label}` } : null;
  };
  const cm = () => {
    const r = cardmarketRows(pricing)[0];
    const amount = r && (r.trend || r.avg || r.avg30 || r.low);
    return amount ? { amount, currency: 'EUR', source: 'Cardmarket', detail: r.trend ? 'trend' : r.avg ? 'average' : r.avg30 ? '30-day avg' : 'low' } : null;
  };
  return lang === 'ja' ? cm() || tcg() : tcg() || cm();
}

export function pricesUpdated(pricing) {
  const d = [pricing?.tcgplayer?.updated, pricing?.cardmarket?.updated].filter(Boolean).sort().pop();
  return d || null;
}

// ---- Local cache of headline prices for album cards ---------------------------

const KEY = 'db.prices.v1';
let cache = (() => {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
})();

export const getCachedPrice = (key) => cache[key];

export function cachePrice(key, pricing, lang) {
  const h = headline(pricing, lang);
  cache[key] = h ? { amount: h.amount, currency: h.currency, source: h.source, at: Date.now() } : { none: true, at: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {}
  return cache[key];
}

// ---- External price links -------------------------------------------------------

export function priceLinks(card, pricing) {
  const enc = encodeURIComponent;
  const isJa = card.lang === 'ja';
  const q = isJa ? `${card.name} ${card.setId} ${card.number}` : `${card.name} ${card.setName} ${card.number}`;
  const productId = tcgplayerRows(pricing).find((r) => r.productId)?.productId;
  const links = [
    {
      label: 'TCGplayer',
      href: productId
        ? `https://www.tcgplayer.com/product/${productId}`
        : `https://www.tcgplayer.com/search/${isJa ? 'pokemon-japan' : 'pokemon'}/product?q=${enc(`${card.name} ${card.setName}`)}`,
    },
    { label: 'Cardmarket', href: `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${enc(card.name)}` },
    { label: 'PriceCharting', href: `https://www.pricecharting.com/search-products?type=prices&q=${enc(`${isJa ? 'japanese ' : ''}${card.name} ${card.number}`)}` },
    { label: 'eBay SG (sold)', href: `https://www.ebay.com.sg/sch/i.html?_nkw=${enc(`${card.name} ${card.number} ${isJa ? 'japanese' : card.setName}`)}&LH_Sold=1&LH_Complete=1` },
  ];
  if (isJa) {
    links.push(
      { label: 'Mercari JP', href: `https://jp.mercari.com/search?keyword=${enc(q)}` },
      { label: 'Yahoo! Auctions JP', href: `https://auctions.yahoo.co.jp/search/search?p=${enc(q)}` },
    );
  }
  return links;
}
