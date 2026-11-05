# Bagerikoll

The bakery's own app for production and logistics, local-first, with the same look as
[Lönekoll](https://github.com/PixelAndi/lonekoll): easy to read at a glance – the
important numbers big, how things stand in coloured squares and chips, details folded away.

## Phase 1: the packing station (Packetering)

- **Who is packing.** Workers tap their names (or a team's nickname) to start a session;
  several can pack together. Every pallet or box registered is tied to everyone in the session.
- **Packing.** Choose a product (filter by brand), then tap **+1 Pall** or **+1 Kartong** –
  big buttons for a tablet on the floor. "Fler …" registers another number on a big number pad.
  What was just registered is shown big, so a wrong tap is seen at once.
- **Undo, never delete.** A worker can undo an entry for two minutes; later only an admin can
  void it, with a reason. Voided entries stay in the log and are left out of every total.
- **Idag.** Today's pallets and boxes, each brand as a chip, the week as squares (darker =
  more pallets), and each brand's products. Who packed what is not shown here.
- **Admin (PIN).** The full production log with packers and station, voiding and restoring,
  per packer today, names, brands (with colours), products (with article numbers), this
  device's station name, CSV export (opens in Excel), and changing the PIN. Admin closes by
  itself after 10 minutes without a tap.
- **Workstation lock.** Admin can lock a device to the packing station: no tabs, no log, no
  settings – unlocking takes the PIN. Unlocked, the device has the full app (Packa, Idag, Admin, Mer).

Brands and products are entered in Admin, so the brand names are not written into the
code (the repository is public). Raw materials, ingredients and dough calculations are not
part of phase 1.

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
