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
| 5 | Package `ZAB_UTIL`? | **Flagged, not confirmed.** | Actual name is `ZABAP_UTIL`, and it's already the linked package of the separate, deployed `Utility-Class-and-Method` repo. Proceeding on a new dedicated package `ZTWR_UTIL` (one-package-per-repo, matching every other project) — full reasoning in `02_solution_architecture.md` §3. Say the word to switch to `ZABAP_UTIL` instead. |
| — | "Rulebook says AUTHORITY-CHECK/DCL are mandatory (§6) — this repo has none" | **Recorded as an accepted, flagged deviation** (D2), not silently ignored. See `02_solution_architecture.md` §7. |

**D8 (new):** *Always check `docs/BUILD_ISSUES_LOG.md` before committing.*
Standing process rule, per instruction — every activation error is logged
there with its fix before the next file is written, so this system's mistakes
are made once, not repeatedly (this is exactly how Employee-360 got to a
green build).

## 6. Status

Design docs 02 approved for Stage 1. Stage 1 source is written and pushed
(`/src` — Data Quality Overview, 8 objects, no custom DDIC, no BDEF, no DCL).
Not yet pulled/activated in the SAP system. Next: client creates/confirms
package `ZTWR_UTIL`, links the repo, pulls, activates, and reports every
error back verbatim for the log.

---

## Change log

| Date | Change |
|---|---|
| 2026-09-04 | Repo created. Feasibility map + this decisions log written. Environment confirmed (S/4 on-prem, S/4 HCM, on-prem scope only). Decisions D1–D7 locked, incl. **read-only, no CDS/RAP authorization**. 13 open confirmations raised. |
| 2026-09-04 | Rulebook applied. Confirmations round 2 received (Payroll on-prem confirmed; PCC/replication-technique/TMS-RFC resolved as non-blocking by design; package flagged — see §5). D8 (bug-log-before-commit) added. `docs/02_solution_architecture.md` and `docs/BUILD_ISSUES_LOG.md` written. Stage 1 (Data Quality Overview, 4 checks) built and pushed to `/src` — not yet pulled/activated. |
