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
customer at the station; who is packing is a list of all names (active filled, the rest
outlined) – anyone taps one to add/remove it, confirmed with "Är du säker?" (no PIN; creating
names is Admin's; the last active packer can't be removed). Landscape tablet: two columns
(`.pack-main` sticky on the left with the buttons and the last entry, `.pack-side` on the right). Pallet +1 only (rests 1.5 s against double taps), boxes +1/+5/+10.

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
the owner says: raw materials, ingredients, automatic order import. **QR scanning at the dock is
dropped** (owner's decision) – the dock relies on per-product verification. **Decided, not built:**
an Android app for the tablets (Capacitor, same code, self-updating web code) and a Raspberry Pi
sync server – see HANDOVER.md items 1 and 9.

**Kontor (built): the office** (`ui/OfficeView.tsx`, `ui/OrderEditor.tsx` shared with Produktion,
`domain/office.ts` + tests), managers only (same gate as Produktion), for computer, tablet and
phone: the paper order book in parallel – orders on their pickup day (= production day), order
number optional, each line ticked "planned for production" (all ticked = "Helt planerad";
editing an amount unticks that line), moving (button, or drag on a computer), print a week or
a day, prices per product and customer (per pallet/box, dated; a standard price for customers without their own) and the weekly accounting summary split by
the customer's billing company (`Customer.billedBy` → a brand), CSV. The owner's paper order
book lists per day the customers' orders with pallets per product, the day's pallets at the
top, and the week's pallets per billing company.

**Navigation by device (owner's decision):** ordinary devices show Stationer, Idag, Logg, Mer
(Admin is under Mer); a manager's device (`settings.productionOpen`) or open admin also shows
Produktion and Kontor. Stationer (`ui/StationsView.tsx`) puts the device in kiosk mode
(`settings.locked` + `lockedTo`: 'pack' | 'dock' | 'accounting'; Ekonomi needs the PIN to start):
only that page and the Admin tab, where "Lämna kioskläget" (PIN) unlocks. **Ekonomi**
(`ui/AccountingView.tsx`, `domain/accounting.ts`, `domain/accountingSheet.ts`, `src/xlsx.ts` – a
dependency-free .xlsx writer; tests): the week complete when every order is loaded; bills what the
dock reported (`Order.delivered`); each line's calculation shown (`lineCalc`, `explain`);
accounting sets prices and costs (`ui/PriceEditor.tsx`; `Product.costs`, `lineCost`; Admin no
longer edits prices); "Veckans vinst" (`profitOf`, `profitBy`) – revenue, cost, gross profit,
margin per day/customer/product; Excel file with
formulas (verify changes by recalculating with LibreOffice, `soffice --convert-to csv`). **Lastkaj** (`ui/DockView.tsx`, `domain/dock.ts` + tests): today's deliveries; loaders
(several) and one forklift driver check in (`Session.kind 'dock'`, `driverId`); "Lastas just nu"
(`Session.loadingOrderId`) checks each product (`Order.lineChecks`: ok / notDelivered / short with
missing boxes, `shortLoaded`); "Klar" sets `shippedAt` + `loadedBy` + `delivered` (from the checks)
and makes a deviation per problem; pallets up to 5 layers show stacked two and two (`stackPlan`,
an assumption – ask the owner if exceptions need a setting); `loading` deviations go to the managers (`ui/LoadingDeviations.tsx` in
Kontor and Produktion) until marked handled. **Boxes per pallet** can be set per order line while
planning (`OrderLine.boxesPerPallet`, `domain/pallet.ts`); a run takes it from the order chosen
at its start (`Run.orderId/boxesPerPallet`) and shows it with `PalletIcon` (EUR pallet, 4 boxes a
layer by default, `Product.boxesPerLayer`).

**The order book** (`ui/OrderBook.tsx`, owner's layout): Mon–Fri left to right like the paper
book; order header = customer + billing marking (`Brand.code`, `billerCode`) + order number; lines
= name, art.no., amount, change marks (`Order.firstLines` kept on the first edit by
`editedOrder`; `lineChange`, `removedLines`; dock differences from `Order.delivered`). Shared by
Kontor (`mode="office"`: ticks, boxes per pallet, edit, move, drag) and Ekonomi
(`mode="accounting"`: read only, amounts) – one template, separate pages per role.

**Admin-only = only what the owner explicitly makes admin-only.** Don't hide
anything else behind the PIN. Now admin-only: managing names, customers, products and
brands; Produktion and Kontor (the managers' parts; or a manager's device set in Admin); this device's station name and the workstation lock (and unlocking
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
