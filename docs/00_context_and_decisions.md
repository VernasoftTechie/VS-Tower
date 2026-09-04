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

## 5. Open confirmations — needed before development starts

Grouped by impact. Answers will be folded into this document and the phase plan.

### Blocks scope of a whole panel
1. **Payroll — on-prem SAP Payroll, or Employee Central Payroll (ECP)?**
   ECP ⇒ the entire Payroll Dashboard (Section I) moves to the CAP track.
2. **Is SAP Payroll Control Center (PCC) licensed and active?**
   If yes, released `I_PayrollProcess*` CDS + standard Fiori cover most of the
   payroll panel for very little build.
3. **"Overall Landscape" selector — one S/4 system, or several?**
   Does the ABAP side need to report on any system other than the local one?

### Determines which tables we read
4. **Inbound replication technique for the SF → S/4 HCM interfaces —**
   **IDoc, SOAP/SRT (web service), AIF, or PTP/point-to-point?**
   Sets whether Sections B–D read `EDIDC/EDIDS`, `SRT_RTC/SRT_MONI`, `/AIF/*`,
   or the PTP framework tables.
5. **Is SAP AIF licensed and used for the HCM interfaces?**
   AIF ships its own message dashboard content and OData services we could reuse.
6. **Retention of SLG1, SRT_MONI and Gateway statistics (days)?**
   Sets how aggressive the nightly snapshot job must be and how much history
   exists at go-live.
7. **Trusted TMS RFC to the transport domain controller — permitted?**
   Decides Transport Monitor depth: local requests only (P1) vs full QA/Prod
   import status (P2).
8. **HR approval workflows — classic SAP Business Workflow, or Flexible Workflow?**
   Released CDS coverage differs sharply; Flexible Workflow may need table reads.

### Determines build shape
9. **S/4HANA release / feature-pack level?**
   Governs which standard CDS exist — IAM (`I_BusinessUser*`), Application Jobs
   (`I_ApplicationJob*`), certificate monitoring, Application Log views.
10. **Fiori deployment target — embedded FLP, standalone FLP, or Work Zone?**
11. **Refresh cadence / near-real-time expectation?**
    Live CDS vs snapshot-served; auto-refresh interval in the UI.
12. **Volumes — active headcount and approximate daily inbound message count?**
    Performance sizing for the "CDS over log tables vs extract-to-Z" decision.

### Confirm the read of an instruction
13. **Data scope per user — confirm interpretation.**
    We have taken *"based on the accessed user position and org … all the data
    should be retrieved by default"* + *"nothing to be considered inside RAP or
    CDS"* to mean: **CDS/RAP return the full, org-wide dataset with no
    user-based filtering**; any narrowing is a Basis/launchpad concern only.
    Correct?

## 6. Next step

On receipt of the Section 5 answers plus the detailed instructions, the next
deliverables are the design docs:

| Doc | Content |
|---|---|
| `02_solution_architecture.md` | Layers, package, CDS/RAP/service/UI structure, reuse map |
| `03_persistence_and_config_model.md` | Z config + snapshot tables (the only custom DDIC) |
| `04_cds_design.md` | Interface → composite → consumption views per panel |
| `05_rap_query_model.md` | Read-only query BOs, no behavior |
| `06_service_and_ui.md` | OData V4 binding(s), freestyle shell + Fiori Elements drill-downs |
| `07_snapshot_and_check_jobs.md` | Nightly aggregation + alert check framework |

---

## Change log

| Date | Change |
|---|---|
| 2026-09-04 | Repo created. Feasibility map + this decisions log written. Environment confirmed (S/4 on-prem, S/4 HCM, on-prem scope only). Decisions D1–D7 locked, incl. **read-only, no CDS/RAP authorization**. 13 open confirmations raised. |
