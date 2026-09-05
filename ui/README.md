# Fiori app — deploy without knowing Fiori

One app, freestyle SAPUI5 (hand-written) — the same pattern as Employee-360's
own `dashboard` app: KPI tiles + donut charts + tables, reading the live
OData V4 service. Talks to the **existing** service `ZTWR_UI_SRVD` — no
backend change.

> **First cut — not yet deployed or visually verified.** Written the same
> way the ABAP layer was: following a proven pattern (this repo copies
> Employee-360's dashboard app structure line-for-line where the shape is
> the same), but genuinely untested until you deploy it. Treat the first
> deploy like the ABAP stages — report back whatever you see, including a
> blank/broken render, and it gets fixed the same way T1–T4 were: logged,
> diagnosed, corrected, no guessing.

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

In the terminal, before deploying:
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
(`ZTWR_CONTROL_TOWER`) into package `ZABAP_UTIL` on your transport (the same
package the CDS/RAP layer already lives in — confirmed shared,
`docs/02_solution_architecture.md` §3). Confirm the prompts.

### 4. Open it — no tile needed for a first look

Straight browser URL (you must be logged into SAP in that browser):
```
https://<your-host>:<port>/sap/bc/ui5_ui5/sap/ztwr_control_tower/index.html
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

## What this covers, and what it doesn't yet

All 6 stages/refinements: Data Quality, Security, Background Job Health,
Transport (by status and by type), Workforce (headcount by company,
by employee group, payroll areas), and the new Workflow Item Overview
(raw type/status counts — not yet the mock-up's Pending/Escalated/Overdue
semantics, same caveat as the CDS side, `00_context_and_decisions.md` §8).

Not on this dashboard: Alerts (planned as a KPI-strip composition over
these same cards — the 4 tiles at the top already do this for Data
Quality/Security/Jobs/Transport; extend the same way for any more), and
anything from `docs/00_context_and_decisions.md` §7's "not built" table —
there's no data behind those yet, so no card was added for them.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `deploy` fails "401 / auth" | wrong `ABAP_USER` / `ABAP_PASSWORD`, or user lacks `S_DEVELOP` for BSP + the transport |
| `deploy` "transport not found / not modifiable" | the transport ID is wrong or already released — use an open one |
| "service not found" | `/IWFND/V4_ADMIN` → confirm `ZTWR_UI_SRVB_O4` is published in this client |
| a card/chart is blank, others work | that entity's `_read()` call likely failed — open the browser console, report the exact error, same as an ABAP activation error |
| every card blank, page loads | check the OData service URL in `manifest.json` matches your actual service binding path (`/IWFND/V4_ADMIN` shows the real path) |
