# Bagerikoll

A phone app (PWA) with the same look as [Lönekoll](https://github.com/PixelAndi/lonekoll).
It is being built: what it will do is still to be decided, so the pages are a
starting point.

What is here:

- **The look.** `src/styles.css` holds Lönekoll's colours (light and dark), header,
  tab bar, cards, buttons, forms, folds, notices, and the Kalender-style pieces
  (a highlighted "now" card, chips, big numbers, a yellow "to check" card,
  coloured squares, status tiles). `src/ui/common.tsx` has the same components
  (`Page`, `Card`, `Fold`, `Notice`, `Field`, `Modal`, `Spinner`, `Icon`).
  Mer → "Byggstenarna" shows every piece with made-up examples.
- **Pages:** Idag (this week as squares), Kalender (the year as squares), Mer
  (language, light/dark, the building blocks). A "Beta" badge in the header.
- **Swedish and English** (`src/i18n.ts`; a test checks both have the same keys).
- **Works offline** (service worker) and can be added to the home screen.
- **Nothing leaves the phone**: a strict Content Security Policy in
  `vite.config.ts`; settings are kept in the browser.

## Commands

```
npm install
npm test          # vitest
npm run typecheck
npm run build
npm run dev
```

## Publishing

`.github/workflows/deploy.yml` tests, builds and publishes to GitHub Pages on
every push to `main`. Turn it on once in the repository: Settings → Pages →
Build and deployment → Source: **GitHub Actions**. The app is then at
https://pixelandi.github.io/bagerikoll/.
