# Bagerikoll – handover for a new chat

Paste or attach this file at the start of a new chat about Bagerikoll. Attach the
original project brief too: it has the company's and brands' real names, which
are deliberately not in this public repository.

## What Bagerikoll is

- The bakery's own **ERP and logistics web app**. Its goal is to make the bakery
  run smoothly and to rule out human errors in production and shipping.
- It is **exactly one app**, this repository (`PixelAndi/Bagerikoll`). Features are
  never split into separate apps.
- **Workstation locking:** a device can be locked to one simplified view. Today
  that is the packing station on a floor tablet. Unlocked, a phone or desktop
  gets the full app.
- **Customers first:** everything that lists products groups and filters them by
  customer (who orders them). The bakery also has two brands, but only accounting
  needs them: brand is a product field in Admin and a column in the CSV export.
- **The look:** the same as the owner's other app, Lönekoll
  (`PixelAndi/lonekoll`), with its core idea of being **easy to read at a
  glance**:
  - the important numbers big;
  - how things stand as coloured squares and chips;
  - one highlighted "now" card;
  - a yellow "to check" card;
  - details folded away.

  `#/design` (Mer → Byggstenarna) shows every building block. Light and dark
  mode both work.
- **Platform:** a PWA built with React, Vite and TypeScript. It works offline and
  can be added to the home screen. Data is stored on the device (Dexie /
  IndexedDB), with no server. It is published to GitHub Pages on every push to
  `main`: https://pixelandi.github.io/Bagerikoll/. Pages has to be turned on once
  under Settings → Pages → Source: GitHub Actions.
- **Languages:** Swedish first, then English (`src/i18n.ts`, same keys in both,
  checked by a test).

## Phase 1, built: the packing station (Packetering)

- **Packa:**
  - Workers start a session by tapping their names or a team's nickname. Several
    can pack together.
  - They pick a product, using brand chips to filter, then tap **+1 Pall** or
    **+1 Kartong**. "Fler …" opens a number pad.
  - Every entry is permanently tied to the session's workers, the time and the
    station.
  - The last entry is shown big, so a wrong tap is seen at once.
  - Workers can undo for 2 minutes. An undone entry is *voided*, never deleted:
    it stays in the log and is left out of every total.
- **Idag:**
  - the day's pallets and boxes, big;
  - the brands as chips;
  - the week as squares (darker means more pallets; tap a day to open it);
  - who packed what;
  - each brand's products.
- **Logg:** every entry with its packers, station and time, filtered by date
  range and brand, with CSV export (semicolon-separated, opens in Swedish Excel).
- **Admin** (PIN; the default is in the brief):
  - managing names, brands (each with a colour), and products (each with a
    brand and an optional article number);
  - this device's station name;
  - **Lås till packstationen**: a locked device shows only Packa, with no tabs,
    and the PIN unlocks it;
  - changing the PIN;
  - voiding or restoring log rows, with a reason.

  Admin closes by itself after 10 minutes without a tap. Five wrong PINs give a
  one-minute wait.
- **Mer:** language, appearance, the building blocks, and About.

### Rules the owner has set

- **Admin-only is only what the owner explicitly makes admin-only.** Who packed
  what and when is open to everyone. Don't hide anything else behind the PIN.
- Phase 1 is only the packing station. Raw material inventory, ingredient
  tracking and dough calculations are out of scope until the owner asks for them.
- The repository is public:
  - don't put real names of people, the company or the brands into code, tests or
    commits (brands and names are data entered in Admin);
  - tests use made-up names.
- Commit to `main` and push when the owner asks. No pull requests unless asked.
  No model names in commits or code.
- The owner tests on an Android phone (Chrome) and the floor will use a tablet.
  The owner writes in English; the UI is Swedish first.
- Say plainly what was and wasn't tested.

## Phase 2, built: Produktion (see README)

Orders, doughs, deviations, stock and the dough recommendation with its chance of being
enough; customers in Admin; the packing station grouped by customer, "Byt packare", and
+1 pallet / +1, +5, +10 boxes.

## Known limits and open decisions (raise these with the owner)

1. **Each device keeps its own data.** For now devices swap a data file (Mer → Datafil).
   The owner wants a local server – to discuss with the boss before building it.
5. **Missed pallets.** The owner is looking for a way to never miss a pallet. Built so far:
   the 1.5 s rest after a pallet tap, and "Att kolla" flags a day that gave clearly less than its
   doughs usually do. Ideas raised: a reminder when no pallet has come for longer than usual;
   a label (with QR) printed per pallet, tying into the planned QR loading check.
6. **Shipping** is not decided (idea: QR on each pallet, a webcam checks what is loaded).
   Until then an order is marked "Lastad" by hand.
7. **Orders** are typed in by hand from the paper list; later they should come in
   automatically and the managers only confirm the production list.
2. **The PIN is a lock against casual use, not real security.** The app runs
   only in the browser and its code is public, so the default PIN can be worked
   out from the repository. Change it per device under Admin.
3. **Not tried on a real tablet yet.** It was checked in a browser at tablet
   size (1024×768) and phone size.
4. **Later phases named in the brief:** raw materials and ingredients, and shipping.

## Map

| Path | What |
| --- | --- |
| `src/domain/types.ts` | Worker, Brand, Product, Session, Entry (with `voided`) |
| `src/domain/production.ts` | totals per product, brand and day (voided entries left out), product sorting, the 2-minute undo, CSV; tests in `production.test.ts` |
| `src/domain/pin.ts` | salted SHA-256 PIN check, tries, wait, admin idle time |
| `src/db.ts` | Dexie tables: workers, brands, products, sessions, entries, meta |
| `src/data.ts` | live lists (`useCatalog`, entries by day or range), brand colours |
| `src/settings.ts` | per-device settings in localStorage: language, theme, station name, locked, PIN hash and length, running session |
| `src/App.tsx` | tabs (Packa, Idag, Logg, Admin, Mer), admin state, idle close, locked mode, PIN pad |
| `src/ui/PackView.tsx` | the packing station |
| `src/ui/TodayView.tsx` | Idag |
| `src/ui/ProductionLog.tsx` | Logg and "who packed what" |
| `src/ui/AdminView.tsx` | the admin controls |
| `src/ui/PinPad.tsx` | the PIN pad |
| `src/ui/DesignView.tsx` | the building blocks |
| `src/ui/common.tsx`, `src/styles.css` | Lönekoll's components and look, plus the packing station's touch styles at the end |

## Commands

```
npm install
npm test          # vitest
npm run typecheck
npm run build
npm run dev
```

Chromium and Playwright are pre-installed in cloud sessions. The UI has been
checked with `vite preview` and a Playwright script that goes through the PIN,
setup, packing, undo, Idag, Logg and the station lock.
