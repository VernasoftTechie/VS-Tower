# VS-Tower — Context & Decisions (Doc 00)

**Project:** VS SF Control Tower — read-only operations-monitoring dashboard
**Repository:** https://github.com/VernasoftTechie/VS-Tower.git
**Status:** Pre-development. Scoping and discussion only. No ABAP until the
design docs (02+) are approved — Vernasoft rulebook.

This document is the running log of what has been decided and what is still
open. All project discussion lives in this repo from here on.

---

## 1. What we are building

A read-only SAP Fiori dashboard ("VS SF Control Tower") that monitors, in one
screen, the health of the SuccessFactors ↔ S/4HANA HCM integration and the
surrounding HR operations: inbound replication, background jobs, workflow, data
quality, OData services, security, transports, and (if on-prem) payroll.

Source of the requirement: the "VS SF Control Tower" dashboard mock-up
(SuccessFactors Integration Command Center) — 16 panels, ~110 discrete data
points. Every point is inventoried in `01_feasibility_map.md`.

## 2. Environment (confirmed)

| Item | Value |
|---|---|
| ABAP stack | **S/4HANA On-Premise**, Standard ABAP, OData V4 |
| HR data | **S/4 HCM** (classic PA / OM infotypes, on-prem) |
| ABAP scope | **On-prem monitoring only.** CPI / SuccessFactors / ECP-native data is a separate CAP / BTP track — same split as Employee 360. |
| Pattern reuse | Employee 360 data-health CDS · Salary Master read-only RAP query · `ZCL_AB_V1_UT` utility framework |

## 3. Locked decisions

| # | Decision | Detail |
|---|---|---|
| D1 | **Read-only dashboard** | No RAP actions anywhere. No write-back. No reprocess / job-restart / alert-acknowledge / notification-dispatch in P1. Any such action is a post-P2 decision and is **not committed**. |
| D2 | **No authorization logic in CDS or RAP** | No DCL. No `AUTHORITY-CHECK` in any RAP query or provider class. CDS/RAP return the **complete dataset**. Access control is entirely at the Fiori launchpad / Basis layer: the dashboard tile + catalog + PFCG role are assigned to **HR and above** profiles. Basis adjusts tile authorization; nothing to be handled inside RAP or CDS. |
| D3 | **On-prem scope only** | The ABAP build covers data that physically lives in this S/4HANA system. CPI message logs, SF Recruiting/Performance, ECP payroll, SF/MDF workflow, true CPI availability → CAP/BTP track (see `01_feasibility_map.md` §22). |
| D4 | **Docs before code** | Design docs 02+ are written and approved before any ABAP object is created. `/src` is added to the repo only when development starts. |
| D5 | **Snapshot-first for history** | A nightly snapshot Z table + aggregation job is built in Phase 1 (even though the trend charts are Phase 2), because SLG1 / SRT_MONI / Gateway statistics retention is too short to reconstruct history. |
| D6 | **Config-driven monitoring** | Monitored interfaces, watched jobs, data-quality checks and alert rules live in Z config tables, so scope growth is configuration, not code + transports. |
| D7 | **Phasing** | Phase 0 foundation → Phase 1 (~70 read-only points) → Phase 2 (~33 points) → CAP track (6 points). Full plan in `01_feasibility_map.md` §25. |

## 4. Coverage at a glance

| Phase | Points | Notes |
|---|---:|---|
| Phase 1 | ~70 | Read-only, CDS + standard RAP query, Fiori Elements / card shell |
| Phase 2 | ~33 | Snapshot-fed trends, freestyle funnel + org tree, cross-system TMS RFC — still read-only |
| CAP track | 6 | Not visible on-prem |

Presentation coverage in Fiori: **~95%** (funnel + org tree need freestyle UI5).

## 5. Confirmations received (round 2)

| # | Question | Answer | Effect |
|---|---|---|---|
| 1 | On-prem SAP Payroll or ECP? | **On-prem SAP Payroll.** | Payroll Dashboard (Section I) stays in ABAP scope. |
| 2 | Payroll Control Center licensed? | **Unknown.** | Non-blocking — Stage 9 (payroll) targets base tables (`T549A`/`T569V`/`TBTCO`) regardless; PCC just makes that stage cheaper if it's there. |
| 3 | Inbound replication technique? | **Not fixed — resolved by design.** | Decision D6 (config-driven interface catalog) already handles this: each interface's log technique is a config value, not a hardcoded assumption. Non-blocking. |
| 4 | Trusted TMS RFC to domain controller? | **Not needed yet.** | Only the remote half of Transport Monitor (Phase 2) needs it. Non-blocking for Phase 1. |
| 5 | Package `ZAB_UTIL`? | **Confirmed `ZABAP_UTIL`** (round 3), after the round-2 flag that it's already the linked package of the separate, deployed `Utility-Class-and-Method` repo. | `VS-Tower` objects now live in `ZABAP_UTIL`. This repo no longer ships its own `package.devc.xml` (removed) so it doesn't fight `Utility-Class-and-Method`'s repo over the package's own description. Operational note in `02_solution_architecture.md` §3: a pull/activate in either repo now enumerates both repos' objects — take care which repo's screen an action is done from. |
| — | "Rulebook says AUTHORITY-CHECK/DCL are mandatory (§6) — this repo has none" | **Recorded as an accepted, flagged deviation** (D2), not silently ignored. See `02_solution_architecture.md` §7. |

**D8 (new):** *Always check `docs/BUILD_ISSUES_LOG.md` before committing.*
Standing process rule, per instruction — every activation error is logged
there with its fix before the next file is written, so this system's mistakes
are made once, not repeatedly (this is exactly how Employee-360 got to a
green build).

## 6. Status

**Stage 1 (Data Quality Overview): done.** Pulled into `ZABAP_UTIL`, activated
clean on the first pass, `ZTWR_UI_SRVB_O4` preview verified with real data —
40,529 issues across the four checks. Zero activation errors logged.

**Stage 2 (Security Monitor): done.** Activation hit one runtime error (T1 —
`USR02-USTYP` conversion exit), fixed with a `cast`, re-pulled, preview
verified — 4,860 users, lock-status criticality rendering correctly.

**Stages 3–5: 4 and 5 confirmed clean; Stage 3 took three attempts to fix.**
All three pulled and activated together, zero activation errors. But using
`BackgroundJob`'s filter bar surfaced T2 — a genuinely blank `StartDate`
(normal for a scheduled-but-not-yet-run job) broke the runtime. Attempt 1
(typed `null` in the CDS) doesn't activate on this system. Attempt 2 (drop
`@UI.selectionField`, keep the date type) activates but the **same error
persists** — proving the value-help theory wrong. Actual fix: expose
`StartDate`/`StartTime`/`EndDate`/`EndTime` as plain text instead of
`Edm.Date`/`Edm.TimeOfDay` — a blank string is never an error for
`Edm.String`. Bundled into the Stage 6 pull for re-verification.

**Stage 6 (Foundation, narrowed): pushed, hit a labelling bug (T3), fixed.**
Interface catalog table (`ZTWR_CFG_IFACE`) — first use of the `TABL` object
type in this repo, built by mirroring `Utility-Class-and-Method`'s one proven
`TABL` object field-for-field. First preview: 0 rows was correct, but every
filter/column label showed a raw, sometimes-wrong data-element label instead
of a business one — `BNAME` (reused for the owner field, proven safe as a
*select source* in Stage 2) resolved to "Branching name" as a *rollname* on
this new table, not a username label. Fixed: `IFACE_OWNER` → `CHAR40`; every
element in `ZI_TWR_CFG_IFACE` now carries an explicit `@EndUserText.label`.
The other three original Stage-4 tables (watched-jobs
catalog, alert config, snapshot history) stay deferred until their consuming
stages exist. Ships empty; a CDS layer over it lets it be verified through
the same Fiori-preview loop as every other stage (0 rows = correct, not an
error).

**Stage 7 (Integration Monitoring): blocked on data, not on this session.**
Needs real interface names + log techniques. Client confirmed **SAP Basis
Team** as the default responsible owner for this reconnaissance —
`03_stage7_data_collection.md` is addressed to them directly and used as the
default `Owner` value in `ZTWR_CFG_IFACE` unless a specific interface names
someone else. Full original Stage 4/5 reasoning (why they weren't built
blind) is in `02_solution_architecture.md` §8.

---

## Change log

| Date | Change |
|---|---|
| 2026-09-04 | Repo created. Feasibility map + this decisions log written. Environment confirmed (S/4 on-prem, S/4 HCM, on-prem scope only). Decisions D1–D7 locked, incl. **read-only, no CDS/RAP authorization**. 13 open confirmations raised. |
| 2026-09-04 | Rulebook applied. Confirmations round 2 received (Payroll on-prem confirmed; PCC/replication-technique/TMS-RFC resolved as non-blocking by design; package flagged — see §5). D8 (bug-log-before-commit) added. `docs/02_solution_architecture.md` and `docs/BUILD_ISSUES_LOG.md` written. Stage 1 (Data Quality Overview, 4 checks) built and pushed to `/src` — not yet pulled/activated. |
| 2026-09-04 | Package confirmed as `ZABAP_UTIL` (round 3). Removed `src/package.devc.xml` so this repo doesn't manage that package's description alongside `Utility-Class-and-Method`. Docs updated throughout. |
| 2026-09-04 | **Stage 1 confirmed green** — pulled, activated clean, preview verified (40,529 rows). Stage 2 (Security Monitor) source written and pushed. |
| 2026-09-04 | **Stage 2 confirmed green after one fix** — T1 (`USTYP` conversion exit) hit, fixed, re-verified (4,860 users). Stage 3 (Background Jobs Monitor) source written and pushed, applying the T1 lesson proactively. |
| 2026-09-04 | Client blocked by a VPN issue, asked to keep building. Stages 4–5 **reordered**: Transport Monitor (local) and Headcount Overview built instead of the original config-tables/Integration-Monitoring plan (new object type + missing client data, respectively — both deferred, not guessed). Stages 3–5 pushed together, pull pending. |
| 2026-09-04 | **Stages 3–5 confirmed clean** — all pulled and verified together. Stage 6 (interface catalog table only, narrowed from the original 4-table plan) built and pushed — first `TABL` object in this repo. `03_stage7_data_collection.md` written: Stage 7 is blocked on real interface data from the client, not on further build work. |
| 2026-09-04 | **T2 found, fixed on the 3rd attempt** — a blank `StartDate` broke `BackgroundJob` regardless of filterability; real fix exposes it (and `StartTime`/`EndDate`/`EndTime`) as text instead of `Edm.Date`/`Edm.TimeOfDay`. Bundled into the Stage 6 pull. SAP Basis Team confirmed as the default `Owner` for Stage 7's interface catalog. |
| 2026-09-04 | **T3 found and fixed** — `InterfaceCatalog`'s filter/column labels showed raw data-element text ("Branching name" for the owner field, sourced from a misapplied `BNAME` rollname). Fixed with `CHAR40` + explicit `@EndUserText.label` on every element. |
