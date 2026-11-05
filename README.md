# Bagerikoll

The bakery's own app for production and logistics, local-first, with the same look as
[Lönekoll](https://github.com/PixelAndi/lonekoll): easy to read at a glance – the
important numbers big, how things stand in coloured squares and chips, details folded away.

## Phase 1: the packing station (Packetering)

- **Who is packing.** Workers tap their names (or a team's nickname) to start a session;
  several can pack together. Every pallet or box registered is tied to everyone in the session.
- **Who is packing can change.** "Byt packare" adds or takes off anyone from the running
  session, no PIN; entries from then on are theirs. (Creating or hiding names is Admin's.)
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
