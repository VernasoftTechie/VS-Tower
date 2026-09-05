# Fiori app — deploy without knowing Fiori

One app, freestyle SAPUI5 (hand-written), reading the live OData V4 service.
Talks to the **existing** service `ZTWR_UI_SRVD` — no backend change.

> **Rebuilt 2026-09-05 around a technical-manager use case, per client
> review of a click-through mockup** (approved before any code changed —
> same discipline as any consequential build step in this repo). The page
> is now a compact grid of uniform, chart-only cards — no tables on the
> dashboard itself — each showing a number, a small donut or by-owner bar
> chart, and a one-line plain-English finding. **Click any card to drill
> into its detail list** (a `sap.m.Dialog`). See "What this covers" below
> for the full card list and what changed structurally.
>
> **Correction, not a reuse**: this drill-down is **not** "the same pattern
> Employee-360 already uses" — checked its code directly, and Employee-360's
> own dashboard has no routing/dialog/navigation at all, same one-page
> layout VS-Tower had before this round. The click-to-detail interaction
> here is new, built fresh with a standard `sap.m.Dialog` — flagging that
> plainly rather than let the wrong provenance stand.
>
> **Charts are hand-rolled SVG/CSS now, not `sap.viz.VizFrame`** — see the
> design note at the top of `Dashboard.view.xml`. `sap.viz` is no longer a
> dependency (removed from `manifest.json`, `ui5.yaml`, `index.html`).
>
> Not yet deployed/visually verified since this rebuild — same "first
> render, report back whatever you see" discipline as every stage before
> it. The **two tooling fixes from the previous deploy attempt still
> apply** (see Troubleshooting) — nothing about this round touches them.

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

Cards that currently have something to attend to (their own KPI > 0 — Data
Quality, Security, both Background Jobs cards, both Transport cards,
Workflow; never the 3 Workforce cards, which are context, not alerts) get a
soft pulse; the header carries a blinking "Live" dot while auto-refresh is
on; every card gets a thin gradient top accent (Horizon accent tokens) and
lifts slightly on hover. All motion respects `prefers-reduced-motion` — see
`css/style.css`.

## What this covers, and what it doesn't yet

**11 uniform, chart-only cards** in two rows — "Needs Attention" then
"Workforce Context" — each with a number, a compact donut or by-owner bar
chart with its legend/values directly beside it, and a one-line finding
computed from the live data (e.g. "Missing Bank details is the largest
group - 18 of 42 (43%)"). **Click any card to open its full detail list**
in a dialog — that's where every table now lives; there are no tables on
the dashboard page itself.

| Card | Chart | Drill-down shows |
|---|---|---|
| Action Center | Bar, by domain | Every item across all 5 domains below, worst first, each with a **Contact** |
| Data Quality | Donut, by category | Recent issues: Employee / Check / Field / Severity |
| Security | Donut, locked users by type | Locked usernames + type |
| Background Jobs (Health) | Donut, by status | Job / Status / **Scheduled By** (`TBTCO-SDLUNAME`, pending activation) |
| Background Jobs by Owner | Bar, jobs per scheduler | Same list, sorted by owner |
| Transport (Status) | Donut, D/R only ("still in the landscape") | Queued requests: Request / Status / Owner |
| Transport by Owner | Bar, open vs. released per ID | Same list, sorted by owner — the pattern the client asked to see repeated everywhere it genuinely applies |
| Workflow | Donut, by status | In-flight items (excludes Completed/Cancelled) |
| Headcount by Company | Donut | Company code breakdown |
| Headcount by Employee Group | Donut | Group breakdown |
| Payroll Areas | Donut | Area breakdown |

**Contact is only shown where the data actually has an owner.** Transport
(`AS4USER`) and Background Jobs (`SDLUNAME`) get a real name. Security and
Data Quality get a fixed team name instead of an invented per-record
owner — locked user accounts and HR master-data issues aren't assigned to
a consultant ID in the source tables, so showing one there would be
reporting data that doesn't exist. Workflow shows an honest "not yet
mapped" placeholder (needs `SWWUSERWI`, not built).

"Recent Transport Requests" — now "Transport (Status)" — shows **only
queued ones** (Modifiable or Released-not-yet-imported), filtered at the
OData source, not client-side, per the client's ask not to show requests
already moved out of the landscape.

**Two reads dropped as dead weight in this round**: `SecuritySummary` and
`TransportTypeSummary` were only feeding cards this redesign doesn't have
anymore — removed from the 5-second refresh cycle rather than left as
wasted load.

Not on this dashboard: Alerts as a separate concept (the Action Center
already is that), and anything from `docs/00_context_and_decisions.md` §7's
"not built" table — there's no data behind those yet, so no card was added
for them.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `deploy` fails "401 / auth" | wrong `ABAP_USER` / `ABAP_PASSWORD`, or user lacks `S_DEVELOP` for BSP + the transport |
| `deploy` "transport not found / not modifiable" | the transport ID is wrong or already released — use an open one |
| `deploy` "Loading archive has failed" | **hit on first deploy, fixed** — `package.json`'s `deploy` script had `--archive-path dist`, which doesn't match how `fiori deploy` builds/reads the archive on this tooling version. Fixed: removed the flag (`npm run build && fiori deploy --config ui5-deploy.yaml --yes`). Already fixed in this repo — only relevant if you've hand-edited the script. |
| `deploy` "The application name must be 15 characters or shorter" | **hit on first deploy, fixed** — `ZTWR_CONTROL_TOWER` is 18 characters; BSP/SAPUI5 repository names cap at 15, same rule as any BSP app. Renamed to `ZCONTROL_TOWER` (14 chars) in `ui5-deploy.yaml` and everywhere it's referenced. If you rename it again, keep it ≤15 chars. |
| "service not found" | `/IWFND/V4_ADMIN` → confirm `ZTWR_UI_SRVB_O4` is published in this client |
| every donut showed "Title of Chart" and no numbers | **hit on first visual review, then superseded** — the original fix reconfigured `sap.viz.VizFrame`'s own title/legend/data-label properties. The 2026-09-05 rebuild replaces VizFrame entirely with hand-rolled SVG donuts (`Dashboard.controller.js` `_donutHtml`), which have no such placeholder to begin with — kept here as history, not expected to recur. |
| a card/chart is blank, others work | that entity's `_read()` call likely failed — open the browser console, report the exact error, same as an ABAP activation error |
| every card blank, page loads | check the OData service URL in `manifest.json` matches your actual service binding path (`/IWFND/V4_ADMIN` shows the real path) |
