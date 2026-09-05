# VS-Tower — Fiori UI Design (Doc 04)

**Status:** §1's OVP recommendation was **superseded** — see the update box
below. Sections 2–8 (card map, groupings, KPI-strip design, navigation,
launchpad tile) still describe the actual app; it's just built as freestyle
SAPUI5 now, in `/ui/controltower`, not generated as an OVP app.
**Preview:** an illustrative mockup of this layout —
https://claude.ai/code/artifact/97cfe246-dc8d-425f-b8dc-d133ed09ab3f
(numbers on it are examples for layout review, not live data; the real app
will render in SAP Horizon, not this mockup's exact colors/fonts).

> **Update, 2026-09-05: built as freestyle, not OVP.** §1's OVP
> recommendation assumed OVP's chart/list card types would bind cleanly
> against an OData **V4** service without needing to verify that first — a
> real, unvetted assumption, unlike everything else in this build which
> follows a pattern already proven on this system. Employee-360 already has
> a **working, deployed freestyle app** (`ui/dashboard`) doing the exact
> same job — KPI tiles (`sap.f.Card`/`NumericHeader`), donut charts
> (`sap.viz.VizFrame`), live OData V4 reads (`bindList`/`requestContexts`
> into a local `JSONModel`) — against the same kind of service this repo
> publishes. Rather than resolve the OVP-V4 question blind, `/ui/controltower`
> mirrors that proven app's structure directly, card-for-card against §2's
> map. See `/ui/README.md` for how to deploy it. Same discipline as the
> ABAP side: first deploy is genuinely untested, report back whatever
> renders (or doesn't) and it gets fixed the same way T1–T4 were.

---

## 1. App type — superseded, see the update box above

~~Fiori Elements Overview Page~~. Kept below for the reasoning trail only —
every entity built (analytical `GROUP BY`+`@UI.chart` views, or list views
with `@UI.lineItem`/`selectionField`) is still exactly OVP-card-shaped in
principle; the objection was never the data shape, only the unverified
OData V4 + OVP pairing. If that gets confirmed later (SAP notes, a working
example, or simply asking whoever owns the Fiori/BTP side), rebuilding this
as a declarative OVP app instead of the current hand-written one is a
reasonable follow-up — the CDS layer needs no changes either way.

## 2. Card map — superseded again, see the 2026-09-05 box

> **Update, 2026-09-05: rebuilt as a compact chart-only grid with
> click-to-drill-down.** The client asked to see the design before any code
> changed; a click-through mockup was built and approved
> (https://claude.ai/code/artifact/d2de6b05-368c-4d15-88b7-d83e47e72245),
> then the real app was rebuilt to match. What changed from the table below
> (kept for the reasoning trail, not current):
> - **No tables on the dashboard at all.** Every card is chart-only — a
>   number, a compact donut or by-owner bar chart with its legend/values
>   beside it, and a one-line plain-English finding. Detail lists (what used
>   to be separate "list" cards below) now live only in a drill-down dialog,
>   opened by clicking the card.
> - **Uniform card size.** Every card is the same fixed height, in one
>   auto-fill grid — not the varied-span layout the table below describes.
> - **The manager's own request, applied everywhere it genuinely fits**:
>   Transport by Owner (already in the table below) got a sibling,
>   **Background Jobs by Owner** — same open-count-per-ID bar chart, backed
>   by the new `Owner` field on `BackgroundJobHealth`. Not applied to
>   Security/Data Quality — those aren't assigned to a consultant ID in the
>   source tables, so a per-record "owner" there would be invented, not
>   reported.
> - **Two cards dropped**: Job Run History and Transport by Type weren't
>   part of what the client reviewed and approved — removed rather than
>   carried forward as dead weight (and `TransportTypeSummary` is no longer
>   even read, saving a request every 5s cycle).
> - Charts are hand-rolled SVG/CSS (`Dashboard.controller.js`), not
>   `sap.viz.VizFrame` — full control over the compact, uniform sizing the
>   approved mockup needed. `sap.viz` is no longer a dependency.
>
> See `ui/README.md` "What this covers" for the current 11-card list and
> exactly what each drill-down shows.

| Card | Type | Entity | Notes |
|---|---|---|---|
| **Action Center** | List (cross-domain) | *client-side union of the rows below* | worst-first (Fiori criticality 1/2 only), Contact column per row |
| Data Quality by Category | Analytical (donut) | `DataQualitySummary` | dimension `Category`, measure `IssueCount` |
| Recent Data Quality Issues | List | `DataQualityIssue` | sort by `SeverityCriticality` desc |
| User Lock Status | Analytical (donut) | `SecuritySummary` | dimension `IsLocked`, measure `UserCount` |
| Locked / At-Risk Users | List | `SecurityUser` | filter `IsLocked = 'X'` as the card's default selection variant |
| **Jobs Needing Attention** | List | `BackgroundJobHealth` | **primary card for this section** — already deduped/filtered server-side, no client filter needed |
| Job Health Split | Analytical (donut) | `BackgroundJobHealthSummary` | dimension `Status`, measure `JobNameCount` |
| Job Run History | List | `BackgroundJobHistory` | secondary/drill-down only — don't lead with this, it's the full unfiltered log |
| Transport by Owner | List (pivoted) | `TransportByOwner` | Owner x RequestStatus rows pivoted client-side into Open/Released/Total per owner — manager ask, "which IDs have TRs stuck open" |
| Transport by Status | Analytical (donut) | `TransportSummary` | dimension `RequestStatus`, measure `RequestCount` |
| Transport by Type | Analytical (donut) | `TransportTypeSummary` | dimension `RequestType`, measure `RequestCount` |
| Open Transport Requests (Queued) | List | `TransportRequestSet` | **filtered to `RequestStatus in ('D','R')` at the OData source** — "don't show moved ones" |
| Headcount by Area | Analytical (donut) | `HeadcountOverview` | dimensions `CompanyCode`/`PersonnelArea`, measure `EmployeeCount` |
| Headcount by Employee Group | Analytical (donut) | `HeadcountByGroup` | dimensions `EmployeeGroup`/`EmployeeSubgroup`, measure `EmployeeCount` |
| Payroll Areas | Analytical (donut) | `PayrollAreaOverview` | dimension `PayrollArea`, measure `EmployeeCount` |

## 3. Card groups (OVP sections)

1. **Data Quality**
2. **Security**
3. **Background Jobs** — put *Jobs Needing Attention* first; *Job Run
   History* last in the group, visually de-emphasized
4. **Transports**
5. **Workforce** — the three headcount/payroll cards

## 4. Alerts & Notifications — not a new entity, a composition

Per the CDS closure (`00_context_and_decisions.md` §7), Alerts doesn't get
its own backend object. Build it in the OVP/launchpad as a **KPI header
strip** or a **stat-tile row** at the top of the page, each tile a filtered
read of a card already above it:

| Tile | Source | Filter |
|---|---|---|
| Data quality issues | `DataQualitySummary` | total |
| Locked users | `SecuritySummary` | `IsLocked = 'X'` |
| Jobs needing attention | `BackgroundJobHealthSummary` | total (already pre-filtered) |
| Transport requests open | `TransportSummary` | `RequestStatus in ('D','R')` |

This is exactly what the preview mockup's top KPI row shows.

## 5. Navigation — implemented, 2026-09-05, not what this section originally described

This section originally described what an **OVP app** would give for
free — every card's "See all" auto-opening the entity's own List Report →
Object Page, generated from the `@UI` annotations already on each
consumption CDS view. That's still not what's built.

**What actually shipped instead**: every card in `/ui/controltower` is
clickable — a `sap.m.Dialog` opens showing that card's own detail list
(built from data already loaded, not a second navigated app or a Fiori
Elements List Report). This was **not** carried over from Employee-360 —
checked directly, Employee-360's own dashboard has no navigation either.
It's a new, standard-SAPUI5 mechanism, built for this round. The
`@UI.selectionField`/key annotations already on every consumption view
(`DataQualityIssue.EmployeeID`, `SecurityUser.Username`,
`TransportRequestSet.TransportRequest`, etc.) still mean a future Fiori
Elements List Report per entity is straightforward to add later if a
proper full-page drill-down (not just a dialog) is ever wanted — the CDS
side needs no further work for that either way.

## 6. Launchpad tile

| Property | Value |
|---|---|
| Title | VS SF Control Tower |
| Subtitle | SuccessFactors Integration Monitoring |
| Icon | `sap-icon://home` or a control-tower-style custom icon, client's choice |
| Semantic object / action | e.g. `ZTwrControlTower-display` |
| Target | BSP application `ZCONTROL_TOWER` (`/ui/controltower`), consuming service `ZTWR_UI_SRVB_O4` |

## 7. What the Fiori developer does

The app is already written — `/ui/controltower`, mirroring Employee-360's
`ui/dashboard` structure card-for-card against §2's map. Nothing to generate.

1. Fill in 3 values in `ui5-deploy.yaml` (host, client, transport) —
   `/ui/README.md` walks through it.
2. `npm install && npm run deploy` — builds and uploads as BSP application
   `ZCONTROL_TOWER` into package `ZABAP_UTIL`.
3. Open `https://<host>:<port>/sap/bc/ui5_ui5/sap/zcontrol_tower/index.html`
   and report back what actually renders — this is the first real test of
   the app, same as every ABAP stage's first pull.
4. Once it renders correctly, wire the launchpad tile per §6 (needs Basis).
5. Theme: SAP Horizon (`sap_horizon`, already set in `index.html`) — no
   custom theming needed.

If something doesn't render, that's expected on a first deploy — report the
browser console error and it gets logged/fixed the same way T1–T4 were on
the ABAP side, not guessed at blind.

## 8. Workflow — data now available, funnel still not

`ZI_TWR_WORKITEM`/`ZC_TWR_WORKITEM`/`ZC_TWR_WORKITEM_SUMMARY` were built
after this doc was first written — a conservative first cut over `SWWWIHEAD`
alone (`00_context_and_decisions.md` §8, `02_solution_architecture.md` §30).
For the OVP card map:

| Card | Type | Entity | Notes |
|---|---|---|---|
| Work Items by Type × Status | Analytical (donut) | `WorkItemSummary` | dimensions `WorkItemType`/`Status` (raw codes — see below), measure `ItemCount` |
| Recent Work Items | List | `WorkItemSet` | no criticality yet — status-code meanings not confirmed |

**Not the funnel from the original mock-up.** `WorkItemType`/`Status` are
exposed as **raw codes**, not mapped to "Pending / In Manager Inbox /
Escalated / Overdue / Completed" — that mapping needs the real code meanings
(seen once this is previewed) and `SWWUSERWI` (manager-inbox assignment,
not built yet). Until then, present this as a generic "Workflow Items"
card, not as the funnel — a funnel chart isn't a standard Fiori Elements
type anyway, so it stays a freestyle-only visual regardless of when the
underlying data is ready.
