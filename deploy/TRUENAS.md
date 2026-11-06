# Bagerikoll on TrueNAS SCALE (test server)

The server (`server/`) serves the app and keeps every device in sync. It stores the data in
SQLite in the encrypted dataset and writes a JSON backup there every day (the last 30 are kept).
It is reached only through a Cloudflare tunnel, with Cloudflare Access (login) in front, so no
port on the home network is opened.

## Install

1. Dataset: `POOL/apps/bagerikoll`, encrypted, owner/group `apps` (568), with snapshots.
2. Cloudflare tunnel: create a public hostname e.g. `bagerikoll.example.se` (your own domain) → **HTTP** `bagerikoll:8080`.
3. TrueNAS → Apps → Discover Apps → ⋮ → **Install via YAML**, name `bagerikoll`. Paste
   `deploy/truenas-compose.yaml` and change:
   - `POOL/DATASET` → the dataset's path as shown under Datasets (e.g. `tank/bagerikoll`);
   - `PASTE-YOUR-TUNNEL-TOKEN-HERE` → the tunnel token. The token stays in TrueNAS only:
     never put it in chat, this repository or a screenshot.
4. Save. Both containers should show *Running*. The tunnel turns *Healthy* in Cloudflare.
5. If the image can't be pulled ("denied"/"unauthorized"), go to GitHub → your profile →
   Packages → `bagerikoll-server` → Package settings → Change visibility → **Public**. The image
   holds only the public code. No data is in it.

## Check that it works

- `https://<your hostname>/api/health` (after logging in) shows `{"ok":true,"app":"bagerikoll"}`.
- Open the app. A badge in the header shows **Synkad HH:MM**. Something added on one device
  shows up on another within about 20 seconds, or immediately when the app is opened.
- The dataset holds `bagerikoll.sqlite` and `backups/bagerikoll-YYYY-MM-DD.json`.

## Moving existing data from the GitHub Pages version

Each web address has its own storage on a device. On the device that has the data, open the old
address, go to Mer → Datafil and save a file. Then open the server's address, go to
Mer → Datafil and read that file in. It syncs to the server from there. Settings that belong to
each device have to be set again on the new address: station name, kiosk mode and the
manager-device setting.

## Updating

Every push to `main` builds a new image (`.github/workflows/server.yml`). The `watchtower`
container in the YAML checks once an hour and restarts the app with the new image (only the
container labelled `com.centurylinklabs.watchtower.enable`; the data is not touched). To update at
once: Apps → bagerikoll → Update (or ⋮ → Pull image / Edit → Save). TrueNAS may show its own
"update" status out of step with what Watchtower did – the app's `/api/health` and the page are
what count.

Open pages notice a new version themselves (every 5 minutes and when shown again) and show
"En ny version av appen finns – Ladda om" (`src/update.ts`). Nothing is lost by reloading.

## Test data

Admin → **Testdata** fills the app with made-up weeks (people, customers, orders, packing,
loading, prices) and takes it all off again with **Ta bort testdata** – from the server and,
at their next sync, from every device. Real data is never touched (test ids start with `demo-`).

## Restoring

- From a snapshot: stop the app, then Datasets → `apps/bagerikoll` → Snapshots → roll back. Start
  the app again.
- From a backup file: any device can read `backups/bagerikoll-….json` in Mer → Datafil (the
  newer copy of each record wins and nothing is deleted). It syncs back to the server.
- Devices keep a full copy too. If the server's data were lost, the first device to sync sends
  everything it has back.

## Later: the company's own server

The same image runs on a Raspberry Pi (arm64) or any machine with Docker. Copy `bagerikoll.sqlite`,
or read the latest backup file in on a device, and point the tunnel at the new machine.
