# Bagerikoll

The bakery's own app for production and logistics, local-first, with the same look as
[Lönekoll](https://github.com/PixelAndi/lonekoll): easy to read at a glance – the
important numbers big, how things stand in coloured squares and chips, details folded away.

## Phase 1: the packing station (Packetering)

- **Who is packing.** Workers tap their names (or a team's nickname) to start a session;
  several can pack together. Every pallet or box registered is tied to everyone in the session.
- **Who is packing can change.** Every name is on the station: the active packers filled,
  the rest outlined. Anyone can tap a name to add or take it off – then "Är du säker?" with
  big Ja/Nej buttons. Several can pack at once; every entry is on all the active packers. The
  last one can't be taken off (finish the session instead). No PIN; creating or hiding names
  is Admin's.
- **Landscape tablet.** Two columns: on the left what is packed now – the product, +1 Pall,
  the box buttons and the last entry with Ångra – always in view; on the right who is packing,
  Avvikelse / Avsluta körning, changing product, the totals and the latest entries. A phone or
  an upright tablet shows the same, stacked.
- **Packing.** Products are grouped under their customer, with chips to filter by customer. **+1 Pall** is the biggest button and rests 1.5 s after a tap, so
  a double tap isn't two pallets (pallets are counted one by one). Boxes: **+1 / +5 / +10**,
  and "Fler kartonger …" for another number. What was just registered is shown big.
- **Undo, never delete.** A worker can undo an entry for two minutes; later only an admin can
  void it, with a reason. Voided entries stay in the log and are left out of every total.
- **Idag.** Today's pallets and boxes, each customer as a chip, the week as squares (darker =
  more pallets), who packed what, and each customer's products.
- **Logg.** Every entry with its packers, station and time, by date range and customer, with
  CSV export (opens in Excel). Open to everyone.
- **Admin (PIN).** Only what the owner has made admin-only: names, customers, products
  (article number, customer(s), pallets per dough, boxes per pallet, brand), brands, this device's station name and lock, the PIN, and voiding
  or restoring rows in the log. Admin closes by itself after 10 minutes without a tap.
- **Workstation lock.** Admin can lock a device to the packing station: no tabs, no log, no
  settings – unlocking takes the PIN. Unlocked, the device has the full app (Packa, Idag, Admin, Mer).

## Runs and the packing protocol (replaces the paper form)

The paper form at the packing line is a food-safety record; the app now fills it in. Each row
is a **run**: one product on the line, from one product change to the next.

- **Starting a run.** Tapping a product starts a run (the customer is the product's, or chosen
  if it has several). Nothing can be packed until the **metal detector test** has passed:
  Ferro 3.5, Non-Ferro 4.5 and Stainless 4.0, each passed or failed.
- **Every two hours** the test is due again: 15 minutes before, the station says so; when it
  is due, the pallet and box buttons give way to the test. A **failed** test stops packing,
  saves a deviation (tied to the run, time and packers) and tells the packers to stop and
  contact the person in charge; packing goes on when a new test passes.
- **Box numbers (BatchNr 01–X)** are worked out: pallets × boxes per pallet + extra boxes
  (boxes per pallet is set per product in Admin; without it the row says so).
- **Finishing a run** (or tapping another product) asks for the last two ticks: **Alla
  kartonger har etikett** (checked last) and **Städat maskin efter brödbyte** (before the next
  product). A run started by mistake, with nothing packed, can be cancelled (kept, marked).
- **Avvikelse** at the station: a note tied to the run, the time and who is packing.
- **Signature** = the packers chosen at the station (everyone who packed in or ticked the run).
- **Packningsprotokoll** (`#/protocol`, from Logg and from the station – also on a locked
  station): the day's runs as the paper form's columns – time, product, BatchNr, pallets and
  extra boxes, customer, each detector test with its time (✓/✗), labels, cleaned, signature –
  and the day's packing deviations. **Print / save as PDF** gives A4 landscape.

Records are never deleted: undone entries are voided and stay; a run's checks can't be edited
afterwards; deviations from the station can't be removed in Produktion. Until there is a
server, everything lives on the tablet: print or save the protocol as PDF every day and save a
data file. Whether this satisfies the bakery's certification is for its quality lead or auditor
to confirm; keep the paper form alongside until they have.

## Kontor (the office; managers – computer, tablet or phone)

The paper order book, entered in parallel while it is tested. Behind the PIN, or open on a
device Admin marks as a manager's device (a manager's phone, the office computer).

- **A week at a time**, the orders on the day they are **picked up** (which is also the day
  they are produced and packed). A computer sees the week side by side (the weekend narrower),
  a tablet two or three days across, a phone one day under the other. Each day shows its
  pallets, the week its pallets, orders, how many are fully planned and its value, and the
  pallets per billing company (as the paper order book sums them up each week).
- **An order:** order number (optional – not every customer has one; a number used twice is
  flagged), customer, pickup day, pallets (and if need be boxes) per product, a note.
- **Planned for production:** each product on an order has a tick. All ticked → the order
  turns green, "Helt planerad". Changing a product's amount unticks that product only, so
  production sees the new amount.
- **Moving:** "Flytta" (the day before/after, a week later, any date) – or drag an order to
  another day on a computer.
- **Printing:** the week, or one day, as a list per day (order no., customer, billed by,
  product, pallets, boxes, planned ✓/☐); the print dialog opens by itself.
- **Accounting:** each customer is billed by one of the billing companies (Admin → Kunder);
  each product has prices per pallet and/or per box, each from a date (Admin → Produkter), so
  older orders keep the price of their day. The week's summary: per billing company, per
  customer, per product – pallets, boxes and amount excl. VAT, with totals; missing prices are
  marked. Print it, or save it as CSV for Excel.
- **To check:** orders for today and tomorrow not fully planned, duplicate order numbers,
  customers without a billing company, products without a price.

## Produktion (managers, phone-first)

Behind the PIN, or always open on a phone Admin marks as a manager's phone (never on a locked
station). The production day is the packing day.

- **Plan for a day.** Per product: ordered, in stock, to make, and the recommended doughs –
  what's needed ÷ what a dough usually gives, **rounded up** – with how likely that is to be
  enough ("Räcker: 86 %") and what one more dough gives. Green ≥ 90 %, yellow ≥ 70 %, red below.
- **What a dough gives** is learnt from history: the day's packed pallets (boxes as part of a
  pallet when boxes per pallet is set) ÷ the day's good doughs. Scrapped doughs are left out; a
  day with a low-yield or other deviation is kept out of the average. Up to the latest 30 normal
  days; under 5 days it leans on the expected pallets per dough set in Admin (default 1) and
  says "lite historik". The chance is a normal distribution over the day-to-day spread.
- **Orders** are copied from the paper list: customer, then pallets per product (boxes when
  needed). Marking an order **Lastad** takes it out of stock – the stand-in for shipping until
  the QR/loading system exists.
- **Doughs and deviations.** Doughs per product per day; deviations: scrapped (how many, and
  the day they're made again), low yield (unexplained), other.
- **Stock** = the latest count (Inventera) ± what was packed and loaded since.
- **Att kolla:** a finished day that gave clearly less than usual (a missed pallet?), doughs
  counted with nothing packed on this device (read in the station's data file), orders from
  earlier days not marked as loaded.

## Data between devices

Each device keeps its own data (no server yet; a local server is the plan). Mer → **Datafil**
saves everything as a JSON file (the share sheet on a phone/tablet) and reads one in: records
are joined by id and the newer copy wins (`updatedAt`, stamped on every write in `db.ts`);
nothing is deleted. Never put a data file in this repository – it holds people's names.

**Customer, not brand.** The app is organised by customer – who orders the product – as
everyone at the bakery thinks of it. A product usually has one customer; it can have more
(shown under each at the station, counted under the first in totals). Brand is only for
accounting: set it on a product in Admin and it is in the CSV export.

Brands, customers and products are entered in Admin, so the brand names are not written into the
code (the repository is public). Raw materials and ingredients are not built yet.

### About the PIN and the data

The app has no server: everything is stored on the device that registered it (IndexedDB),
and the PIN is a lock against casual use at a workstation, not real security – the code is
public and the data is not encrypted. The PIN is stored as a salted hash; change it under
Admin → Byt PIN-kod (per device). Sharing one log between several devices needs a shared
store (a server or a shared drive) – a decision for a later phase.

## Commands

```
npm install
npm test          # vitest
npm run typecheck
npm run build
npm run dev
```

## Publishing

`.github/workflows/deploy.yml` tests, builds and publishes to GitHub Pages on every push
to `main`. Turn it on once: Settings → Pages → Build and deployment → Source:
**GitHub Actions**. The app is then at https://pixelandi.github.io/Bagerikoll/.
