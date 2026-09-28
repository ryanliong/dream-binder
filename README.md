# Dream Binder

A personal Pokémon card "dream binder". Browse real **English and Japanese** sets, tap ♥ to collect cards into your own album, and see each card's HD image, details and market price in **SGD**.

**Live:** https://ryanliong.github.io/dream-binder/

It's a static site with no backend, hosted free on GitHub Pages and built mobile-first.

## Features

- **Browse**: toggle EN / JP to see sets newest first, with logo, release date and card count. Open a set to see its cards laid out like a binder page, at the real 63×88 card shape.
- **Search**: search by card name within a language, with set and rarity filters.
- **Album**: tap ♥ to add or remove a card. Each card has a Wishlist/Owned status and notes (e.g. "want PSA 10"). You can sort by date added, price, set or name, filter by language and status, and see the total estimated value in SGD. Prices refresh when the album opens, two cards at a time.
- **Card detail**: HD image (tap to zoom), attacks, abilities and other details. Every price is shown in SGD with the original USD/EUR, plus links to TCGplayer, Cardmarket, PriceCharting, eBay SG, and Mercari JP / Yahoo! Auctions JP for Japanese cards.
- **Backup & Sync**: export the album as JSON, or import one. Importing merges, never overwrites, and shows a summary. Optional **GitHub Gist sync** keeps your phone and laptop in step.
- Light and dark mode, lazy-loaded images, skeleton placeholders while loading, a holo shimmer on rare cards, and a clean placeholder for cards with no image.

## Data sources

| What | Source | Notes |
|---|---|---|
| Sets, cards, prices | [TCGdex API](https://tcgdex.dev) (`api.tcgdex.net/v2/{en,ja}`) | Free, no key. Prices come from its `pricing.tcgplayer` (USD) and `pricing.cardmarket` (EUR) data. |
| Card images | TCGdex `image` + `/low.webp` or `/high.webp` | Missing for about 70% of Japanese cards. |
| JP image fallback | Limitless TCG image store (`tpc/{SET}/{SET}_{n}_R_JP_{SM,LG}.png`) | Not an official API. It fills most modern JP gaps. If it fails, a placeholder shows instead. |
| SGD exchange rates | [Frankfurter](https://frankfurter.dev) (ECB reference rates) | Cached for 24 h. The rate date is shown on each card. |

API responses are cached in memory and in `sessionStorage`, so browsing back and forth doesn't call the API again. Network errors show a message with a **Try again** button.

## Where your data lives

The album is saved in your browser's **localStorage**. There is no server. Clearing site data or switching devices loses it unless you:

- **Export** a JSON backup (Backup tab → Export), or
- turn on **Gist sync**: create a [GitHub token with only the `gist` scope](https://github.com/settings/tokens/new?scopes=gist&description=Dream%20Binder%20sync) and paste it into the Backup tab on each device. The album is stored as `dream-binder-album.json` in a secret gist on your account. Changes merge per card (the newest edit wins, and removals carry over). The token stays in that browser and is only sent to `api.github.com`.

## Run locally

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npm run preview    # serve the production build
```

## Deploy

Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which builds with Vite and publishes `dist/` to GitHub Pages.

One-time setup for a fresh fork: **Settings → Pages → Source: GitHub Actions**. The Vite `base` in [`vite.config.js`](vite.config.js) is `/dream-binder/` for production builds. Change it if the repo has a different name.

## Project layout

```
src/
  main.js        app shell, hash router, EN/JP toggle, theme
  api.js         TCGdex client + memory/sessionStorage cache
  images.js      image sources: TCGdex → Limitless (JP) → placeholder
  price.js       reading TCGdex pricing, headline price, price links, price cache
  fx.js          USD/EUR → SGD (Frankfurter, cached 24 h)
  album.js       localStorage album with per-card timestamps + tombstones
  sync.js        GitHub Gist sync (pull → merge → push)
  ui.js          DOM helpers, card tile, skeletons, toasts
  views/         sets, set, card, search, album, backup
```

Personal project. Not affiliated with Nintendo, The Pokémon Company, TCGdex or Limitless TCG. Card images and names © their respective owners.
