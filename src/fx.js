// USD/EUR → SGD via Frankfurter (ECB reference rates, free, no key).
// api.frankfurter.app 301-redirects to this host, so call it directly.

const URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=SGD,EUR';
const KEY = 'db.fx.v1';
const MAX_AGE = 24 * 60 * 60 * 1000;

let pending = null;

function readCache() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

/**
 * Resolves to { USD, EUR, date, fetchedAt, stale } where USD/EUR are "SGD per 1 unit",
 * or null if no rate has ever been fetched and the network is unavailable.
 */
export function getRates() {
  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < MAX_AGE) return Promise.resolve(cached);
  if (pending) return pending;
  pending = fetch(URL)
    .then((r) => {
      if (!r.ok) throw new Error(`FX ${r.status}`);
      return r.json();
    })
    .then((d) => {
      const rates = {
        USD: d.rates.SGD,
        EUR: d.rates.SGD / d.rates.EUR, // SGD per EUR, derived from the USD base
        date: d.date, // ECB publication date
        fetchedAt: Date.now(),
      };
      try { localStorage.setItem(KEY, JSON.stringify(rates)); } catch {}
      return rates;
    })
    .catch(() => (cached ? { ...cached, stale: true } : null))
    .finally(() => { pending = null; });
  return pending;
}

export function toSGD(amount, currency, rates) {
  if (amount == null || !rates) return null;
  if (currency === 'SGD') return amount;
  const r = rates[currency];
  return r ? amount * r : null;
}

const num = (n, d = 2) => n.toLocaleString('en-SG', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtSGD = (n) => (n == null ? '—' : `S$${num(n)}`);
export const fmtOrig = (n, currency) =>
  n == null ? '—' : currency === 'USD' ? `US$${num(n)}` : currency === 'EUR' ? `€${num(n)}` : `${num(n)} ${currency}`;
