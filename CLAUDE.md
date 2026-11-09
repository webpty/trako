# trako

Tracks four vehicles fitted with Teltonika trackers: a map, every raw record,
and a dashboard. Private site at trako.cc for David (admin) and his brother.
Repo `webpty/trako`. Domain on Cloudflare DNS, registered at Namecheap,
DNSSEC on since 9 Nov 2026 (DS: key tag 2371, algorithm 13, digest type 2).

## How it fits together

- Trackers (FMC003 X4 x2, FMC003 LA, FMM003) send Codec 8 / 8 Extended over raw
  TCP to the relay; Cloudflare cannot take raw TCP below Enterprise (Spectrum
  TCP is an Enterprise add-on), so the relay exists.
- Relay: Hetzner CAX11 (Arm, Falkenstein), 188.245.5.217, Ubuntu 26.04, Node 22,
  ~$7.60 a month. `relay/relay.mjs` + `relay/teltonika.mjs`, plain Node, no
  packages. On the server: code in /opt/trako-relay, service `trako-relay`
  (systemd, user trako-relay), settings in /etc/trako-relay.env, queue in
  /var/lib/trako-relay/spool, firewall open on 22 and 5027 only. SSH from
  this Mac: `ssh -i ~/.ssh/trako_relay root@188.245.5.217`.
- The relay writes each packet to disk before acknowledging it, then posts
  batches to `POST /api/ingest` with `Authorization: Bearer INGEST_SECRET`,
  retrying with back-off. Every IMEI is accepted; unknown ones register as
  unassigned trackers and the admin puts them in a vehicle on Vehicles.
- Updating the relay is a release: ask David before each one.

## Stack and bindings

- React 19, Vite, TypeScript, HeroUI + HeroUI Pro, MapLibre on OpenFreeMap
  (map credits switched off at David's request). Worker with Assets, D1, R2.
- Worker `trako`, custom domain trako.cc. Released only by a push to `main`
  (Workers Builds); never `wrangler deploy`.
- D1 `trako-db`, id 04729d9c-5ff0-4221-af16-9e88b91be4f6. R2 `trako-media`
  (photos). `EMAIL` send_email from codes@trako.cc. `SIGN_IN_LIMIT` rate limit.
- Secrets: `SESSION_SECRET`, `INGEST_SECRET` (same value as INGEST_SECRET in
  /etc/trako-relay.env; change both together). `HEROUI_AUTH_TOKEN` is a build
  secret on the Worker.
- Schema in `migrations/`; the four vehicles are created there. Never put
  David's e-mail address in a committed file: the admin row is added by hand.

## Rules this project has paid for

- Import HeroUI Pro by subpath (`@heroui-pro/react/sidebar`), never the root:
  the root drags in every component's optional peers.
- `react-resizable-panels` is needed by Pro's AppLayout.
- npm 10 on this Mac fails with "edgesOut"; install with `npx -y npm@11 install`.
- An effect must never return a value: newer browsers answer
  `window.scrollTo` with a promise, and `useEffect(() => window.scrollTo(..))`
  crashed every page change. Write effect bodies in braces.
- Test the built Worker: `npm run serve` (port 8810). Locally no mail is sent;
  the code is in the server's log. Three codes per address per ten minutes.
- Headless checks run in the Mac's default browser, out of sight.
- Records are kept once per (imei, time); the dashboard reads `days`, worked
  out from records by the 10-minute cron and before each dashboard read.
  Days are UTC days.
- IO names and scales come from Teltonika's AVL ID list (`shared/io.ts`);
  check the scales against the first real data.

## Waiting for David

Not built; ask about each once the site is live and tested: trip and stop
detection; refuel detection and the fuel-photo Shortcut; tolls (estimate, then
Ulys and Panapass via the NAS); costs per trip/month/country/vehicle;
tracks to geotrac.cc twice daily; service data and fault-code alerts; storage
mode; per-vehicle settings sent to the tracker; Strava/Garmin link; FOTA WEB.
Open questions: Things Mobile roaming in Japan and Panama, fees and pausing,
SMS from their portal, 2G in the UK, Italy and Ireland; Teltonika offline
buffering and roaming limits, the FMM003 version for Japan, FMC003 end of
life, and whether the 2021 Q5 reports fuel level.
