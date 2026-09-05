# Fiori app — deploy without knowing Fiori

One app, freestyle SAPUI5 (hand-written) — the same pattern as Employee-360's
own `dashboard` app: KPI tiles + donut charts + tables, reading the live
OData V4 service. Talks to the **existing** service `ZTWR_UI_SRVD` — no
backend change.

> **First deploy attempted 2026-09-05 — two tooling issues found and fixed**
> (see Troubleshooting below). Not yet re-deployed/visually verified since.
> Written the same way the ABAP layer was: following a proven pattern (this
> repo copies Employee-360's dashboard app structure line-for-line where the
> shape is the same), but genuinely untested until it renders. Treat every
> deploy like the ABAP stages — report back whatever you see, including a
> blank/broken render, and it gets fixed the same way T1–T4 were: logged,
> diagnosed, corrected, no guessing.
>
> **Reframed 2026-09-05 around a technical-manager use case** — see "What
> this covers" below. The page now leads with an **Action Center** (what
> needs attention, who to contact) instead of opening straight into
> per-domain donuts.

---

## The whole process: edit 3 values, run 1 command

### 0. One-time on your PC
- Install **Node.js LTS** (nodejs.org).
- That's it. No VS Code extension, no BAS needed for deploy.

### 1. Fill in your system — 3 values

In **`controltower/ui5-deploy.yaml`** replace:

| Placeholder | With |
|---|---|
| `REPLACE-WITH-YOUR-S4-HOST:PORT` | your S/4 host+port, e.g. `http://ikjdcdevcha01:8000` (the URL you use for SAP GUI for HTML / Web ADT) |
| `REPLACE-CLIENT` | your logon client, e.g. `100` |
| `REPLACE-WITH-TRANSPORT` | an **open workbench transport request** — create one in `SE10` (New → Workbench Request), or ask Basis; paste its ID e.g. `DCDK900123` |

*(Do the same in `ui5.yaml` if you also want to run it locally first.)*

### 2. Set your SAP credentials (so the deploy can log in)

Easiest: copy **`controltower/.env.example`** to **`controltower/.env`** (same
folder) and fill in your real username/password. `.env` is gitignored —
it never gets committed. `ui5-deploy.yaml` reads `ABAP_USER`/`ABAP_PASSWORD`
from it automatically at deploy time — no shell export needed.

Alternatively, set them in the terminal for that session only:
```bash
# Windows PowerShell
$env:ABAP_USER="YOURSAPUSER"
$env:ABAP_PASSWORD="yourpassword"
```
```bash
# macOS / Linux / Git Bash
export ABAP_USER=YOURSAPUSER
export ABAP_PASSWORD=yourpassword
```

### 3. Deploy

```bash
cd ui/controltower
npm install
npm run deploy
```

This builds the app and uploads it as a **BSP application**
(`ZCONTROL_TOWER`) into package `ZABAP_UTIL` on your transport (the same
package the CDS/RAP layer already lives in — confirmed shared,
`docs/02_solution_architecture.md` §3). Confirm the prompts.

### 4. Open it — no tile needed for a first look

Straight browser URL (you must be logged into SAP in that browser):
```
https://<your-host>:<port>/sap/bc/ui5_ui5/sap/zcontrol_tower/index.html
```

### 5. (Later) put it on the Fiori Launchpad — needs Basis

A Launchpad **tile** needs PFCG + Launchpad-admin rights.
`docs/04_fiori_ui_design.md` §6 has the semantic object/action/icon to hand
to whoever administers your Fiori Launchpad. Access follows decision D2 —
scope the tile/catalog to **HR and above**; nothing to configure in CDS or
RAP.

---

## Run locally first (optional sanity check)

```bash
cd ui/controltower
# edit ui5.yaml -> fiori-tools-proxy -> your host/port/client
npm install
npm start
```
Opens the app in your browser, proxied to the live service.

## Live refresh

The dashboard polls every **5 seconds** (`REFRESH_MS` in
`Dashboard.controller.js`) — confirmed by the client on 2026-09-05 after a
feasibility review, in place of the "every 2 seconds" originally floated.
Each cycle re-runs all 13 reads (`_loadAll`) and the 4 KPI numbers ease to
their new value rather than snap, so a real change reads as a live tick, not
a flicker.

- **In-flight guard**: if a cycle is still running when the next tick fires
  (slow round-trip), that tick is skipped rather than stacked — the interval
  never queues concurrent polls.
- **Pause switch**: the header switch next to the last-updated timestamp
  stops the timer (`onToggleAutoRefresh`) without navigating away — useful
  if someone wants a still frame, or if load ever needs to be dialed back
  without a code change.
- **Load math**: 13 reads × (1000ms / 5000ms) ≈ **2.6 requests/second per
  open browser tab** against `ZTWR_UI_SRVB_O4` — multiply by however many
  people leave the tab open. If that ever looks heavy in practice, the fix
  is changing `REFRESH_MS` (or the default switch state), not the CDS layer.

## Visual style

KPI tiles that currently have something to attend to (data-quality issues,
locked users, jobs needing attention — each bound to its own KPI value, not
a single fixed set) get a soft pulse; the header carries a blinking "Live"
dot while auto-refresh is on; cards get a thin gradient top accent (Horizon
accent tokens) and lift slightly on hover. Chosen as the "bolder / more
animated" option the client picked over a plainer "tasteful" pass and over
full glow/neon/particle theming — deliberately short of the latter, per the
same 2026-09-05 review. All motion respects `prefers-reduced-motion` — see
`css/style.css`.

## What this covers, and what it doesn't yet

**Leads with the Action Center** (2026-09-05, technical-manager framing) —
one table, worst item first, pulling from every domain below: Data Quality
issue, locked user, job needing attention, open transport, in-flight
workflow item — each row with a **Contact** column (who to loop in: the
job's `SDLUNAME`/scheduler, the transport's `AS4USER`/owner, or a fixed team
name for Security/Data Quality where there's no per-record owner in
standard tables). Below it, all 6 stages/refinements as before: Data
Quality, Security, Background Job Health (now with a Scheduled-By column),
Transport (by status, by type, **and now by Owner** — open vs. released
count per developer/consultant ID), Workforce (headcount by company, by
employee group, payroll areas), and Workflow Item Overview (raw type/status
counts — not yet the mock-up's Pending/Escalated/Overdue semantics, same
caveat as the CDS side, `00_context_and_decisions.md` §8).

"Recent Transport Requests" now shows **only queued ones** (Modifiable or
Released-not-yet-imported) — filtered at the OData source, not client-side
— per the client's ask not to show requests already moved out of the
landscape.

Not on this dashboard: Alerts (planned as a KPI-strip composition over
these same cards — the 4 tiles at the top already do this for Data
Quality/Security/Jobs/Transport; extend the same way for any more), a real
"Contact" for Workflow items (needs `SWWUSERWI`, not built), and anything
from `docs/00_context_and_decisions.md` §7's "not built" table — there's no
data behind those yet, so no card was added for them.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `deploy` fails "401 / auth" | wrong `ABAP_USER` / `ABAP_PASSWORD`, or user lacks `S_DEVELOP` for BSP + the transport |
| `deploy` "transport not found / not modifiable" | the transport ID is wrong or already released — use an open one |
| `deploy` "Loading archive has failed" | **hit on first deploy, fixed** — `package.json`'s `deploy` script had `--archive-path dist`, which doesn't match how `fiori deploy` builds/reads the archive on this tooling version. Fixed: removed the flag (`npm run build && fiori deploy --config ui5-deploy.yaml --yes`). Already fixed in this repo — only relevant if you've hand-edited the script. |
| `deploy` "The application name must be 15 characters or shorter" | **hit on first deploy, fixed** — `ZTWR_CONTROL_TOWER` is 18 characters; BSP/SAPUI5 repository names cap at 15, same rule as any BSP app. Renamed to `ZCONTROL_TOWER` (14 chars) in `ui5-deploy.yaml` and everywhere it's referenced. If you rename it again, keep it ≤15 chars. |
| "service not found" | `/IWFND/V4_ADMIN` → confirm `ZTWR_UI_SRVB_O4` is published in this client |
| every donut showed "Title of Chart" and no numbers | **hit on first visual review, fixed** — no VizFrame had ever had its title/legend/data-label config set, so sap.viz fell back to its placeholder title and showed no value labels at all. Fixed in `Dashboard.controller.js` (`_configureCharts`): title off (the Card header already shows it), legend on, data labels on (`type: "value"` — the raw count, not a percentage). |
| a card/chart is blank, others work | that entity's `_read()` call likely failed — open the browser console, report the exact error, same as an ABAP activation error |
| every card blank, page loads | check the OData service URL in `manifest.json` matches your actual service binding path (`/IWFND/V4_ADMIN` shows the real path) |
