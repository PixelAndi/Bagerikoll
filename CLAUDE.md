# Bagerikoll – notes for Claude

A local-first PWA with the same look as Lönekoll (github.com/PixelAndi/lonekoll,
the owner's other app). Started as a shell: the look, a tab bar (Idag, Kalender,
Mer), Swedish/English, offline, GitHub Pages deploy. **What the app is for has
not been decided yet – ask the owner before building features.**

- Keep the look in step with Lönekoll: `src/styles.css` and `src/ui/common.tsx`
  were copied from there (its styles.css: base 1–566, modal/spinner, Fold,
  `.issue-link`, the Kalender section and "The Kalender's look on the other
  pages"). Pages follow Lönekoll's Kalender idea: coloured squares for how
  things stand, one highlighted "now" card (`cal-focus`), chips (`cal-chips`),
  big numbers (`cal-numbers`), a yellow "to check" card (`cal-check`), what's
  coming, details in folds. `#/design` shows every piece.
- The owner tests on an Android phone (Chrome, added to the home screen),
  replies in English; the UI is Swedish first. Every text in `src/i18n.ts` in
  every language (same keys, tested).
- The repository is public: never commit personal data.
- Commit to `main` and push when the owner asks; no pull requests unless asked;
  no model names in commits or code.
- Commands: `npm test`, `npm run typecheck`, `npm run build`, `npm run dev`.
  Chromium + Playwright are pre-installed in cloud sessions for checking the UI
  with `vite preview`.
