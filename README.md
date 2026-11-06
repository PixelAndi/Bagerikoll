# Bagerikoll

The bakery's own app for production and logistics, local-first, with the same look as
[Lönekoll](https://github.com/PixelAndi/lonekoll): easy to read at a glance – the
important numbers big, how things stand in coloured squares and chips, details folded away.

## Phase 1: the packing station (Packetering)

- **Who is packing.** Workers tap their names (or a team's nickname) to start a session;
  several can pack together. Every pallet or box registered is tied to everyone in the session.
- **Upstairs at the belt (optional).** Whoever moves the bread from the trays onto the belt and
  checks its quality is picked under the packers when the session starts, or changed on the
  station ("Är du säker?"). None chosen means the packer does both. Each registration keeps who
  was upstairs; the protocol, the Logg and the CSV show it.
- **Uppe** is its own tab at the packing station, run from downstairs: who is upstairs, and
  quality problems they call down (burnt, pale, size, shape, damaged, other), saved as quality
  deviations on the product on the line.
- **Orders:** with fixed boxes per pallet the station shows what is left of the order, and boxes
  beyond it as extra – noted at the end of the run and listed in Fryslager until used. A manager
  can instead set an order line to "all on N pallets, however many boxes"; the station then asks
  for the boxes on each pallet.
- **Halva kartonger:** boxes without enough bread are registered, wait in the freezer, and are
  filled with the next production of the product (counted as boxes of that run).
- **Lägg till / Dra av.** A toggle flips the pallet and box buttons to subtract from the count for a miscount, instead of only undoing the last entry; the count never goes below zero.
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

## Navigation by device

Admin sets what each device is (**Den här enheten är**):

- **An ordinary device** shows Stationer, Idag, Logg and Mer. **Admin** is reached from Mer (PIN).
  **Stationer** makes it a workstation: **Packetering** or **Fryslager** opens and the device goes
  into **kiosk mode** – only that page and the **Admin** tab, where the PIN leaves kiosk mode.
- **A manager's device** (a manager's phone, the office computer; or any device with admin open)
  shows Stationer, Produktion, Kontor, Ekonomi and Mer, without the PIN. Its **Stationer** is the
  live view of every station: who packs, who is upstairs at the belt, the product, the count,
  the detector test and the last registration; the freezer's loaders, driver and the delivery
  being loaded; today's totals with links to the day's protocol, Idag and the Logg; and the last
  two weeks, each day leading to its protocol (who packed what). As fresh as the stations' sync.
- **Accounting's device** shows only **Ekonomi** (and Mer), without the PIN.

## The order book (Kontor and Ekonomi)

The paper order book, digital – one shared layout (`ui/OrderBook.tsx`) on two pages:
**Monday to Friday left to right** (Saturday and Sunday only when they have orders), each day
with its pallets; each order as the book writes it: **the customer, the billing company's marking**
(e.g. "ABC" – set per billing company in Admin, else made from its capitals) **and the order
number**; under it each product with **name, article number and amount**, marked when it changed:
✎ changed after the order was entered ("ändrad, var 4 pall", "tillagd efteråt", "borttagen" –
the first version is kept on the first edit), 🚚 loaded another count at the dock. No mark = as
ordered.

At a glance each order is compact – one short line per product (Kontor: the tick, name, article
number and pallets; Ekonomi: name, article number and what was delivered, with only the order's
total in kronor), a ✎ or 🚚 at the end of a changed line, and the order's state at the foot. ▾ on
an order, or "Visa detaljer för alla", opens the full view: what changed, boxes per pallet, each
line's amount, Ändra and Flytta.

- **Kontor (managers)**: the same book plus the planned-for-production ticks, boxes per pallet,
  Ändra, Flytta and dragging to another day.
- **Ekonomi (accounting)**: read only – delivered or not, each line's amount (of what was
  delivered), each order's and each day's total.

## Ekonomi (accounting)

**Skriv ut** prints the week as day columns (customer, order number, products, delivered quantities and amounts, day and week totals) plus the invoice basis per billing company — black on white, thin rules, no fills, A4 landscape, for minimal ink.


- **A week at a time, in calendar order.** At the top: whether the week is **complete** – every
  order picked up in it loaded at the dock with its quantities reported – the delivered value
  (excl. VAT), pallets delivered, deliveries done and the amount per billing company.
- Each day shows its delivered orders with **each line's calculation written out** ("3 pall × 20
  kart. × 95,00 kr = 5 700,00 kr"); deliveries not loaded yet are marked. **What the dock reported
  is billed** (it can differ from the order), with the order's boxes per pallet.
- **Prices are set here** by accounting: per customer (or a standard price), per pallet and/or
  per box, each from a date – and **costs** (what a product costs to make: raw materials,
  packaging …, per pallet and/or box, from a date, the same for every customer).
- **Veckans vinst**: revenue, cost, gross profit and margin for the week in big figures, each day
  as a square (green = profit, yellow = thin margin under 15 %, red = loss), and the week per
  customer and per product, the most profitable first, with a margin bar. Rows without a price
  or a cost are left out and named.
- **Excel file (.xlsx)**: sheet *Leveranser* in calendar order – day, order no., customer,
  billing company, product, pallets, boxes per pallet, boxes, pallet price, box price, amount and
  the calculation in words – with the prices worked out from each other and the amounts, day sums
  and week total as formulas; sheet *Summering* per billing company and customer with SUMIFS on
  the first sheet. Checked by recalculating it in LibreOffice. Also printable.

## Fryslager (the freezer: loading and stock) – formerly "Lastkaj"

- **Inventera**: count the freezer stock product by product (pallets and boxes), saved with the
  time and who counted; stock is then counted from it (counted + packed − loaded). Open to
  everyone, on the freezer's tablet or on a phone.
- **📱 Inventera med mobilen** shows a QR code (made on the device, nothing sent anywhere) that a
  phone scans to open the count page; it closes after 30 seconds, or when closed. Admin → "QR-kod
  för inventering" shows the link and sets it (e.g. a server address later) and how many seconds
  the code shows.
- Until there is a shared server, a count made on a phone stays on the phone – read its data file
  in on the tablet (Mer → Datafil). The page says so.

### Förbered and OBS

Right after production, the person putting a delivery into the freezer taps **🧊 Förbered** and
marks each product **I frysen**, or **Saknas** with how many pallets and boxes. With nothing
missing the delivery shows "Klar i frysen – väntar på leverans". For a missing product, **OBS**
(urgent production first thing on the next working day) is asked for – ticked by default – unless
a manager has blocked OBS for that product (Produktion → "OBS: vilka produkter får göras akut":
some need more people than are in early); then the screen says so and the shortage still reaches
the managers. The managers' **OBS card** (Produktion and Kontor) lists each request – product,
amount, customer and order, who asked and when – with Planera / Neka (or Planera ändå / Sett for
a blocked product) and then Klar.

### Loading

- **Today's deliveries** – the orders picked up today, plus earlier ones from the last week not
  loaded yet – each with its customer, order number, pallets per product and the pallet's height
  (boxes per pallet). Ones with a deviation first, then those to load, then the loaded ones;
  today's loaded deliveries and pallets in numbers at the top.
- **Check in** like the packers: the **loaders** (several at once) and **one forklift driver**.
  Adding or removing someone, or changing the driver, asks "Är du säker?"; the last one checked
  in can't leave (finish the session instead).
- **Lastas just nu**: "Börja lasta" on a delivery brings it to the top in a highlighted card –
  the customer's name and the pallet total big, and **every product on the order as its own row**
  (pallets, boxes, the pallet's height – pallets of up to 5 layers, i.e. 20 large boxes, are
  shown stacked two and two, "3 × 2 staplade + 1"; taller ones one by one). Each product is ticked **✓ Lastad**, or reported
  **Saknas**: *not delivered* (nothing of it) or *boxes missing* (how many – the app works out
  what was loaded: missing boxes come off the extra boxes first, then off the pallets). "Ändra"
  takes a tick back; "Pausa" leaves the delivery half-checked to go on later.
- **Klar – lastad** opens once every product is checked and, with "Är du säker?" listing any
  problems, marks the delivery loaded with the time, loaders, driver and **the quantities
  actually loaded** – what accounting bills. Each problem becomes a deviation shown to the
  managers. It can be taken back for two minutes. **Avvikelse** (wrong count, damaged, missing,
  other + a note) is saved with the delivery, time and crew and **shown to the managers** in
  Kontor and Produktion until one marks it handled.

## Boxes per pallet

A product has its standard count (and boxes per layer, default 4 – the large boxes, 2 × 2 on an
EUR pallet). While planning in Kontor, each order line can be given its own count – it can
depend on where the order is delivered – picked from the standard and the counts used before,
each shown as a pallet at its height, or typed in. When a packer starts a run, today's orders
for the product are offered; the chosen order's count shows big on the run, with the pallet
picture (marked when it differs from the standard), and the box numbers (BatchNr) follow it.
The pallet pictures (`ui/PalletIcon.tsx`) are drawn from a photo of a real pallet; every count
is drawn at the same scale, so a taller stack looks taller (Mer → Byggstenarna shows them).

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
  each product has prices **per customer** – per pallet and/or per box, each from a date –
  plus an optional standard price for customers without their own (Admin → Produkter), so
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
  needed). Marking an order **Lastad** (at the loading dock, product by product) takes it out of
  stock.
- **Doughs and deviations.** Doughs per product per day; deviations: scrapped (how many, and
  the day they're made again), low yield (unexplained), other.
- **Stock** = the latest count (Inventera) ± what was packed and loaded since.
- **Att kolla:** a finished day that gave clearly less than usual (a missed pallet?), doughs
  counted with nothing packed on this device (read in the station's data file), orders from
  earlier days not marked as loaded.

## Data between devices

**The GitHub Pages site is a demo**: it fills itself with made-up data each day and has a bar to
show the app as a manager's phone, the packing station, the freezer or accounting. The real app
runs on the bakery's own server.

Opened from Bagerikoll's server (`server/`, see `deploy/TRUENAS.md`), every device keeps a full
copy and syncs with the server (the header shows **Synkad HH:MM**; offline work syncs later).
Opened from anywhere else, each device keeps its own data. Mer → **Datafil**
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
