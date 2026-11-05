# Bagerikoll – notes for Claude

A local-first ERP/logistics PWA for a bakery, with the same look as Lönekoll
(github.com/PixelAndi/lonekoll, the owner's other app). One single app; a device
can be locked to a simplified workstation view. **Everything is categorised by
customer** (who orders the product); brand is kept only for accounting (Admin and the CSV
export) – the owner's decision. README.md describes it.

**Phase 1 (built): the packing station** – workers pick their names to
start a session, register pallets and boxes per product (tied to the session's
workers), undo within 2 minutes (voided, never deleted). Idag shows the totals
at a glance and who packed what; Logg (open to all) has every entry with its
packers, station and time, filters and CSV export. Products are grouped under their
customer at the station; "Byt packare" changes who is packing (anyone, no PIN; creating names
is Admin's). Pallet +1 only (rests 1.5 s against double taps), boxes +1/+5/+10.

**Runs + the packing protocol (built; replaces the paper form – a food-safety record, the owner
wants it compliant):** `domain/runs.ts` (+ tests), `PackView.tsx`, `ProtocolView.tsx`. A run =
one product from change to change. Metal detector test (Ferro 3.5 / Non-Ferro 4.5 / Rostfri 4.0)
at every product change and every 2 h – packing is blocked until it passes; a failed test stops
packing and saves a `detector` deviation. Ending a run requires "Alla kartonger har etikett"
(checked last) and "Städat maskin efter brödbyte" (after the product, before the next). BatchNr
= box numbers 01–(pallets × boxes per pallet + extra boxes), per run. Signature = the session's
packers (owner confirmed that is compliant). Station deviations (`packing`, `detector`) carry the
run, time and workers and can't be removed. Never weaken these rules without the owner.

**Phase 2 (built): Produktion** (`ui/ProductionView.tsx`, `domain/plan.ts` + tests), for the
managers on their phones: orders from the paper list (pallets by default, boxes possible),
doughs per product per day, deviations (scrapped / low yield / other), stock (count ± packed
± loaded; "Lastad" on an order stands in for shipping), and the plan: doughs = need ÷ usual
yield, rounded up, with the chance it's enough. Deviation days are kept out of the yield.
Behind the PIN, or open on a phone marked as a manager's phone in Admin. Out of scope until
the owner says: raw materials, ingredients, shipping/QR loading, automatic order import.

**Admin-only = only what the owner explicitly makes admin-only.** Don't hide
anything else behind the PIN. Now admin-only: managing names, customers, products and
brands; Produktion (the managers' part; or a manager's phone set in Admin); this device's station name and the workstation lock (and unlocking
it); changing the PIN; voiding/restoring log rows (workers undo their own for 2
minutes). The PIN (default from the owner's brief) is stored only as a salted
hash in `domain/pin.ts`, changeable per device; HANDOVER.md has the full brief.

- **Don't write the company's or the brands' real names into the code** (public
  repo) – they are data entered in Admin. Tests use made-up names.
- Data lives per device (Dexie, `src/db.ts`). Devices exchange data by file (Mer → Datafil,
  `src/datafile.ts`, merge in `domain/datafile.ts`: by id, newer `updatedAt` wins, nothing
  deleted). The owner's goal is a local server – to be discussed with the boss first; don't
  build sync before that. Never commit a data file (people's names).
- Map: `src/domain/` (types, production totals/CSV, plan, data file merge, PIN; tests),
  `src/ui/PackView.tsx` (station), `ProductionView.tsx` (Produktion), `TodayView.tsx` (Idag), `ProductionLog.tsx` (Logg + per packer),
  `AdminView.tsx`, `PinPad.tsx`, `App.tsx`
  (admin state, idle close, locked mode), `settings.ts` (per device, localStorage).

- Keep the look in step with Lönekoll: `src/styles.css` and `src/ui/common.tsx`
  were copied from there (its styles.css: base 1–566, modal/spinner, Fold,
  `.issue-link`, the Kalender section and "The Kalender's look on the other
  pages"). Pages follow Lönekoll's Kalender idea: coloured squares for how
  things stand, one highlighted "now" card (`cal-focus`), chips (`cal-chips`),
  big numbers (`cal-numbers`), a yellow "to check" card (`cal-check`), what's
  coming, details in folds. `#/design` shows every piece.
- The owner tests on an Android phone (Chrome, added to the home screen); the
  floor will use a tablet. Replies in English; the UI is Swedish first. Every text in `src/i18n.ts` in
  every language (same keys, tested).
- The repository is public: never commit personal data.
- Commit to `main` and push when the owner asks; no pull requests unless asked;
  no model names in commits or code.
- Commands: `npm test`, `npm run typecheck`, `npm run build`, `npm run dev`.
  Chromium + Playwright are pre-installed in cloud sessions for checking the UI
  with `vite preview`.
