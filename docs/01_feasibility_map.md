# VS-Tower — Feasibility Map (Doc 01)

**Project:** VS SF Control Tower — read-only operations-monitoring dashboard
**Repository:** https://github.com/VernasoftTechie/VS-Tower.git
**Status:** DRAFT — scoping. No ABAP until the design docs are approved.
**Companion:** `00_context_and_decisions.md` (locked decisions + open confirmations)

---

## 1. What this document is

Every tile of the VS SF Control Tower dashboard, broken into its underlying data
points and scored against an **on-prem S/4HANA CDS + read-only RAP + Fiori**
build. The ABAP side owns **on-prem monitoring only**; SuccessFactors- and
CPI-native data is deferred to a later CAP / BTP track (same split as
Employee 360).

Standard released CDS / Fiori content is used wherever it exists — every such
assumption is tagged **_verify in system_** and must be checked in the actual
box before the estimate is firm.

## 2. Coverage summary

| Phase | Points | Definition |
|---|---:|---|
| **P1** | ~70 | Read-only. Pure / near-pure CDS, standard RAP query, Fiori Elements or a simple card. Low risk. |
| **P2** | ~33 | Needs a snapshot job, a freestyle UI5 control (funnel, org tree), snapshot-fed trend, or a cross-system RFC. Still read-only. |
| **CAP** | 6 | Not visible on-prem — deferred to the SuccessFactors / CPI CAP track. |

Counts are indicative and will shift with the Section 22 answers.
**Presentation coverage in Fiori: ~95%.**

## 3. Legend

| Tag | Meaning |
|---|---|
| **P1** | Phase 1 — read-only, CDS + standard RAP query, Fiori Elements / card. Start here. |
| **P2** | Phase 2 — snapshot job, freestyle UI5 control, snapshot-fed trend, or cross-system RFC. Read-only. |
| **CAP** | Not on-prem — deferred to the SuccessFactors / CPI CAP track. |
| Feasibility | Simple · Medium · Medium+ (carries a risk noted in the row) · Complex |

> **No RAP actions anywhere.** The dashboard is display-only. Reprocess /
> job-restart / alert-acknowledge are listed below only to record that they were
> considered — they are **not committed** and, if ever built, are a post-P2
> decision.

---

## 4. Section A — Global & header controls

| Data point | On-prem source | Feasibility | Phase |
|---|---|---|---|
| Landscape / system selector ("Overall Landscape") | CDS parameter + value help; single-system unless landscape data is federated | Simple | P1 |
| Effective date / period filter | CDS parameter, Fiori filter bar | Simple | P1 |
| Manual refresh + "last updated" stamp | UI5 model refresh; `sy-datum/uzeit` or snapshot run time | Simple | P1 |
| Notification bell + open-alert badge | `COUNT` over Z alert table (Section L) — display only | Simple | P1 |
| Signed-in user & role context | `sy-uname`, `I_BusinessUser` / `AGR_USERS` | Simple | P1 |
| Tile → detail drill-down navigation | RAP query + Fiori Elements intent-based navigation | Medium | P1 |

## 5. Section B — Top KPI tiles

Base counts come from the on-prem inbound replication log. "vs yesterday"
deltas and averages need the nightly snapshot table (Section H).

| Data point | On-prem source | Feasibility | Phase |
|---|---|---|---|
| Employees synced today | Application Log (`BALHDR`/`BALDAT`) obj `PAOC_SFI_*` / `HRSFEC`; or SOAP monitor `SRT_MONI`; or Z staging | Medium | P1 |
| Δ vs yesterday (+12%) | Snapshot history Z table | Medium | P2 |
| Pending interfaces | SOAP queue `SRT_RTC`, bgRFC `ARFCSSTATE`/`TRFCQOUT`, AIF status tables | Medium | P1 |
| Failed integrations today | `SRT_MONI` error status / IDoc status 51,68 (`EDIDS`) / AIF errors | Medium | P1 |
| Successful runs % | Derived: success ÷ total from the rows above | Simple | P1 |
| Last sync time | `MAX(timestamp)` of successful inbound | Simple | P1 |
| Avg processing time | SOAP runtime fields / Gateway statistics / bgRFC exec time | Medium | P2 |
| Payroll replication status | Application Log for payroll-replication object / job log `TBTCO` | Medium | P1 |
| CPI availability — proxy signal | `RFC_PING` on the CPI SM59 destination + age of last inbound message. **Risk:** not a true health check | Medium+ | P2 |
| CPI availability — "All Systems" true status | Integration Suite monitoring — not on-prem | — | CAP |

## 6. Section C — Integration Monitoring (inbound interfaces)

> **⏸ On hold, 2026-09-04.** This section's design (below) assumed a Z
> catalog of monitored interfaces — client direction is now standard tables
> only, no customization (D9). The catalog was built, worked, and was
> retired anyway. Parked, not being rebuilt around a lighter workaround. See
> `02_solution_architecture.md` §20/§23.

Per-interface table (Employee, Position, Cost Center, Payroll, Time, Leave,
Benefits, Bank Details). Driven by a Z catalog of monitored interfaces so a new
interface is configuration, not code — the design this section describes,
**not currently being built** (see the note above).

| Data point | On-prem source | Feasibility | Phase |
|---|---|---|---|
| Monitored-interface catalog | Z config table (name, technique, log object, expected schedule, owner) | Simple | P1 |
| Last run per interface | `MAX` timestamp from log / job | Simple | P1 |
| Status per interface (green/amber/red) | Derived from last-run recency + error count vs threshold | Medium | P1 |
| Processed count (window) | `COUNT` of messages / records in period | Medium | P1 |
| Failed count | `COUNT` of error messages | Medium | P1 |
| Pending / backlog count | Queue depth (SOAP / bgRFC / AIF) | Medium | P1 |
| Drill to message / record list | RAP query + Fiori Elements List Report | Medium | P1 |
| Reprocess / re-run _(not committed)_ | RAP action → `SRT_UTIL` requeue / AIF restart / bgRFC resubmit. **Risk:** data-integrity | Medium+ | post-P2 |

## 7. Section D — Inbound Message Monitor (reframed "CPI Monitoring")

> **⏸ On hold, 2026-09-04.** Same reason as Section C above — same table,
> same D9 direction.

The screenshot's CPI panel shows message-processing logs that live in
Integration Suite. On-prem the equivalent is the SOAP/IDoc inbound message
monitor — same columns, message seen from the moment it reaches S/4.

| Data point | On-prem source | Feasibility | Phase |
|---|---|---|---|
| Message ID / GUID | `SRT_MONI` (`SRT_RTC`), IDoc `EDIDC` | Simple | P1 |
| Interface / service name | SOAP config (`SRT_MMASTER`) / IDoc partner profile | Simple | P1 |
| Start time + duration | SOAP runtime fields | Medium | P1 |
| Status + error text | SOAP status / linked Application Log | Medium | P1 |
| CPI-side processing steps / MPL | Integration Suite OData `MessageProcessingLogs` — not on-prem | — | CAP |

## 8. Section E — OData / API Monitor

Health of the S/4 OData services that CPI/SF consume. Sourced from SAP Gateway
statistics. **Check first:** the standard *OData Service Monitoring* /
`/IWFND/STATS` content — _verify in system_.

| Data point | On-prem source | Feasibility | Phase |
|---|---|---|---|
| Inbound OData service list | `/IWFND/SU_STAT`, `/IWBEP/SU_STAT`, `/IWFND/MED_*` (catalog) | Medium | P1 |
| Response time (avg / max) | Gateway statistics | Medium | P1 |
| HTTP status distribution | Gateway statistics | Medium | P1 |
| Last call timestamp + call volume | Gateway statistics | Simple | P1 |
| Service up / down (synthetic) | Derived: last successful call within threshold | Simple | P1 |
| Outbound HTTP calls S/4 → SF | Consumer proxy `SRT_MONI` / custom client log. **Risk:** often no calls in a push model | Medium+ | P2 |

## 9. Section F — Replication Summary & Error Analysis

The two donuts. Same base data as the KPI tiles, grouped and categorised.
Error buckets need a Z mapping of message class → category.

| Data point | On-prem source | Feasibility | Phase |
|---|---|---|---|
| Successful / Failed / Pending split | Grouped base counts, `@UI.Chart` donut | Simple | P1 |
| Total errors today | `COUNT` | Simple | P1 |
| Error category split (Authentication / Validation / Master data / Mapping / Other) | Application Log message class + Z bucket mapping / AIF error category | Medium | P1 |
| Drill to errors by category | RAP query + List Report | Medium | P1 |
| Error trend over time | Snapshot history Z table | Medium | P2 |

## 10. Section G — Data Quality Overview

The strongest fit in the whole dashboard — pure CDS over PA infotypes / OM.
The Employee 360 Data Health views are directly reusable.

| Data point | On-prem source | Feasibility | Phase |
|---|---|---|---|
| Missing email | `PA0105` subtype 0010/MAIL absent for active employees | Simple | P1 |
| Missing cost center | `PA0001` `KOSTL` blank / `IT0027` absent | Simple | P1 |
| Missing manager / reports-to | `HRP1001` A002 relationship / chief-position rule | Medium | P1 |
| Invalid / dummy position | `PA0001` `PLANS` = 99999999 / not in `HRP1000` | Simple | P1 |
| Duplicate employee | `PA0002` name+DOB / `PA0185` national ID — `GROUP BY` / `HAVING > 1` | Medium | P1 |
| Missing bank details | `PA0009` subtype 0 absent for payroll-relevant employees | Simple | P1 |
| Drill to employee list per check | RAP query + Fiori Elements List Report | Medium | P1 |
| Extended check pack (address, work schedule, basic pay, contract end, infotype gaps, future-dated actions, invalid email format, org-assignment gaps) | CDS over `PA0006 / 0007 / 0008 / 0016 / 0000` | Medium | P2 |
| Navigate to maintenance (PA30) | Intent-based navigation / URL to transaction | Medium | P2 |
| Data-quality trend over time | Snapshot history Z table | Medium | P2 |

## 11. Section H — Employee Sync Trend

Foundational. Every "vs yesterday" delta and every trend chart in this document
depends on the nightly snapshot, because SLG1 / SRT_MONI / Gateway statistics
are reorganised on a short retention. **Ship the snapshot job in Phase 1** even
though the charts land in Phase 2.

| Data point | On-prem source | Feasibility | Phase |
|---|---|---|---|
| Nightly snapshot job + history table | ABAP job aggregating the day's counts into a Z table | Medium | P1 |
| 7 / 30 / 90-day success vs failure series | CDS date-bucket aggregation over the Z table | Simple | P2 |
| Line / area chart | Fiori Elements chart or UI5 micro/viz chart | Simple | P2 |

## 12. Section I — Payroll Dashboard

In scope **only if payroll runs on-prem** (SAP Payroll), not in Employee Central
Payroll. If **Payroll Control Center** is licensed, its released CDS + Fiori apps
cover most of this panel — _verify in system_.

| Data point | On-prem source | Feasibility | Phase |
|---|---|---|---|
| Payroll areas | `T549A` / `T549Q` | Simple | P1 |
| Payroll runs today + control-record status | `T569V` + job log `TBTCO` (`RPCALCx0`) | Medium | P1 |
| Payroll Control Center (if present) | Released `I_PayrollProcess*` CDS + standard Fiori | Medium | P1 |
| Employees processed / successful | Results directory `RGDIR` (`CU_READ_RGDIR` / `PYD_*`) or PCC | Medium | P2 |
| Errors / warnings | Payroll log / PCC step results | Medium | P2 |
| Result split (donut) | Grouped counts | Simple | P2 |
| Posting to FI status | `PYP_*` posting index. **Risk:** cluster/index extraction | Medium+ | P2 |
| If payroll is ECP (cloud) | Entire panel moves to the CAP track | — | CAP |

## 13. Section J — Workflow Overview

Classic SAP Business Workflow only (leave requests, PA actions, position
changes). Flexible Workflow scenarios have limited released CDS — _verify_.
SF / MDF workflows are CAP-track. The funnel shape is not a Fiori Elements chart.

| Data point | On-prem source | Feasibility | Phase |
|---|---|---|---|
| Pending approvals | `SWWWIHEAD` status READY/STARTED, work-item type W | Medium | P1 |
| In manager inbox (assigned, unstarted) | `SWWUSERWI` | Medium | P1 |
| Overdue (missed latest-end) | `SWWWIHEAD` / `SWWWIDEAD` deadline fields | Medium | P1 |
| Completed today | Status COMPLETED + timestamp today | Simple | P1 |
| Escalated | Deadline-monitored WIs with escalation. **Risk:** escalation modelling varies by scenario | Medium+ | P2 |
| Funnel chart | Freestyle UI5 — no standard funnel; stacked-bar approximation. **Risk:** custom control upkeep | Medium+ | P2 |
| Drill to work-item list / open in inbox | RAP query + List Report + `SAP_WAPI_*` | Medium | P2 |

## 14. Section K — Background Jobs Monitor

The replication/sync batch jobs. `TBTCO`/`TBTCP` directly, or the standard
Application Jobs CDS (`I_ApplicationJob*`) if jobs run through the job
catalog — _verify in system_.

| Data point | On-prem source | Feasibility | Phase |
|---|---|---|---|
| Job status — last run, return code | `TBTCO` / `TBTCP` or `I_ApplicationJob*` | Simple | P1 |
| Watched-jobs catalog | Z config table | Simple | P1 |
| Duration | End − start from `TBTCO` | Simple | P1 |
| Aborted / cancelled jobs | `TBTCO` status A | Simple | P1 |
| Missed-schedule detection | Expected next run (from catalog) vs actual | Medium | P2 |
| Drill to job log / spool | URL to SM37 / `BP_JOBLOG_READ` | Medium | P2 |
| Re-run job _(not committed)_ | RAP action → `JOB_OPEN/SUBMIT/CLOSE` | Medium+ | post-P2 |

## 15. Section L — Alerts & Notifications

A Z alert store populated by background **check jobs** (ABAP, not RAP), displayed
by the dashboard. In a read-only dashboard the alert list is **display-only** —
alerts clear automatically when the underlying condition resolves. Manual
acknowledge is not committed.

| Data point | On-prem source | Feasibility | Phase |
|---|---|---|---|
| Alert store + rule / severity config | Z tables + check framework (reuse `ZCL_AB_V1_UT` logging) | Medium | P1 |
| Replication-failure alerts | From inbound error counts (Section C) | Medium | P1 |
| Job-failure alerts | From `TBTCO` | Simple | P1 |
| Data-quality threshold alerts | From DQ views vs configured threshold | Simple | P1 |
| SSL / server certificate expiry | `SSFC_GET_CERTIFICATELIST` / `STRUSTSSL*`; standard cert monitoring in newer FPS — _verify_ | Medium | P1 |
| OAuth client secret / token expiry | `OA2C_CONFIG`, `OA2C_*` tables. **Risk:** outbound clients only | Medium+ | P2 |
| RFC destination failures | `RFC_PING` sweep over `RFCDES` | Medium | P2 |
| Notification dispatch (email / Fiori) | BCS (`CL_BCS`) / `/IWNGW/` notification provider. **Risk:** this is an outbound action, not read-only | Medium | post-P2 |
| Manual acknowledge / snooze / close _(not committed)_ | RAP transactional BO + draft | Medium | post-P2 |
| Pure CPI-side interface-failure alerts | Integration Suite — not on-prem | — | CAP |

## 16. Section M — Organizational Structure

OM data is fully on-prem; the tree control is the only hard part — Fiori Elements
has no tree, so it is a freestyle `sap.m.TreeTable`.

| Data point | On-prem source | Feasibility | Phase |
|---|---|---|---|
| Headcount rollup by node | `PA0001` aggregated to org unit | Medium | P1 |
| Region / area grouping | Z mapping org unit → region, or personnel area / company code | Medium | P1 |
| Headcount-by-region donut | CDS `@UI.Chart` | Simple | P1 |
| Org hierarchy (O-O, O-S, S-P) | `HRP1000`/`HRP1001`, `RH_STRUC_GET`, hierarchy CDS annotation | Medium | P2 |
| Tree UI | Freestyle `sap.m.TreeTable`. **Risk:** custom control | Medium+ | P2 |

## 17. Section N — Recruitment Overview

Recruiting funnel lives in SF Recruiting → CAP track. Only the hire-side counts
are on-prem (`PA0000` actions).

| Data point | On-prem source | Feasibility | Phase |
|---|---|---|---|
| New joiners this month | `PA0000` hire actions, hire date in month | Simple | P1 |
| Upcoming / future-dated hires | `PA0000` / `PA0001` future-dated records | Simple | P1 |
| Terminations & attrition this month | `PA0000` leaving actions | Simple | P2 |
| Open requisitions / interviews / offers | SF Recruiting — not on-prem | — | CAP |

## 18. Section O — Performance Overview

| Data point | On-prem source | Feasibility | Phase |
|---|---|---|---|
| Avg API response | Gateway statistics aggregate | Medium | P1 |
| Longest-running job | `TBTCO` max duration in window | Simple | P1 |
| System availability % | CCMS / GRMG, or computed from downtime windows / `SDF/SMON`. **Risk:** no single clean source | Medium+ | P2 |
| ABAP dumps / update errors today | `SNAP` (ST22), `VBHDR` (SM13) | Medium | P2 |
| Avg CPI duration | Integration Suite — not on-prem | — | CAP |

## 19. Section P — Security Monitor

Fully on-prem. Consider the standard IAM CDS (`I_BusinessUser*`) and the
*Display and Maintain Users* app content — _verify in system_.

| Data point | On-prem source | Feasibility | Phase |
|---|---|---|---|
| Locked users | `USR02` `UFLAG` | Simple | P1 |
| Password-expired / ageing users | `USR02` + `login/password_expiration_time` | Medium | P1 |
| Certificates expiring ≤ 30 days | `STRUST` (shared with Section L) | Medium | P1 |
| Communication / technical users | `USR02` `USTYP` in B/C/S | Simple | P1 |
| Privileged / `SAP_ALL` / dormant admin users | `AGR_USERS`, `USR02` last logon | Medium | P2 |
| Failed-logon spikes / users without role | `USR02` counter, `AGR_USERS` | Medium | P2 |

## 20. Section Q — Transport Monitor

Requests in this system are native. Import status in QA/Prod is on other systems
and needs a trusted TMS RFC to the domain controller — the one cross-system
dependency in the ABAP scope.

| Data point | On-prem source | Feasibility | Phase |
|---|---|---|---|
| Pending (modifiable) in this system | `E070` status D, `E07T` text | Simple | P1 |
| Released, awaiting import | `E070` status R | Simple | P1 |
| Requests by owner / age | `E070` `AS4USER` / `AS4DATE` | Simple | P1 |
| Import status in QA / Prod | `TMS_MGR_GET_IMPORT_HISTORY` / `TMS_MGR_READ_TRANSPORT_QUEUE` via TMS RFC. **Risk:** cross-system RFC + auth | Medium+ | P2 |
| Failed imports (RC ≥ 8) | Import history / ALOG via TMS FM. **Risk:** as above | Medium+ | P2 |

## 21. Section R — Foundation & cross-cutting build items

Not dashboard tiles — the shared plumbing every section leans on. Mostly
Phase 1 because later work stalls without it.

| Build item | Notes | Phase |
|---|---|---|
| Snapshot history table + nightly aggregation job | Feeds every delta and trend; standard log retention is too short otherwise | P1 |
| Config tables — interface catalog, watched jobs, checks, alert rules | Keeps scope growth as configuration, not transports | P1 |
| CDS layering: interface → composite → consumption | Same pattern as Employee 360; reuse its Data Health views | P1 |
| RAP: read-only query BOs for all monitoring lists | Same shape as Salary Master's read-only query. No behavior pool with actions. | P1 |
| OData V4 service binding(s) | One shared service or one per area | P1 |
| Freestyle SAPUI5 dashboard shell | `sap.f.Card`, micro charts — the command-centre layout is beyond OVP | P1 |
| Fiori Elements List Report / Object Page drill-down apps | One per detail entity (messages, jobs, errors, employees…) | P1 |
| FLP content + catalog | **No CDS/RAP authorization.** PFCG role + tile/catalog assignment is a Basis task, scoped to *HR and above*. | P1 |
| Reuse wiring — `ZCL_AB_V1_UT`, Employee 360 views, Salary Master payroll technique | Logging, RFC, date helpers already built | P1 |
| Freestyle controls: funnel, org tree | The two non-standard visuals | P2 |
| Performance strategy: extract-to-Z vs live CDS on SLG1/SRT | Decide early — those tables are not built for analytics | P1 |

## 22. Explicitly deferred to the CAP / BTP track

- **CPI message processing log** — the "CPI Monitoring" table's real source, incl. per-step detail and CPI duration metrics.
- **True CPI / iFlow availability** — "All Systems Online" across the tenant.
- **SuccessFactors Recruiting, Performance, LMS** — the recruitment funnel and any performance-review counts.
- **Employee Central Payroll** — the entire Payroll Dashboard, if payroll is not on-prem.
- **SF / MDF workflow** — approvals that run in SuccessFactors rather than SAP Business Workflow.
- **Inbound OAuth / token health from CPI's side** — S/4 only sees its own outbound clients.

## 23. Open questions to settle before committing

Full list with rationale is in `00_context_and_decisions.md` §5. Headline four:

1. **Payroll — on-prem SAP Payroll or Employee Central Payroll?** Decides whether Section I is in scope at all.
2. **Is Payroll Control Center licensed and active?** If yes, released CDS + Fiori cover most of the payroll panel for little effort.
3. **Inbound replication technique — IDoc, SOAP/SRT, AIF, or PTP?** Determines which log/queue tables Sections B–D read.
4. **Trusted TMS RFC to the domain controller — allowed?** Decides Transport Monitor depth (local only vs full import status).

## 24. Risks & assumptions

- **CDS directly over SLG1 / SRT_MONI / Gateway-statistics tables** — not designed for analytics, can be slow, some are cluster/INDX, structures shift across releases. Mitigation: extract to Z snapshot tables (adds a batch layer, already planned).
- **Standard log deletion jobs** may already be aggressive — coordinate with Basis so history isn't lost before the snapshot job runs.
- **Trends and deltas need history from day one** — if the snapshot job ships late, early data is simply missing.
- **Funnel + org tree** are freestyle UI5 — more build and maintenance than Fiori Elements, and outside the low-risk path.
- **Cross-system calls** (TMS import status, CPI ping) add RFC/destination dependencies and failure-handling code.
- **Released-CDS availability varies by release** — every _verify in system_ row must be checked in the actual box before the estimate is firm.

## 25. Proposed phasing

### Phase 0 — Foundation
`packages · abapGit · config & snapshot tables · reuse wiring`

Config tables (interface catalog, alert rules, watched jobs, checks), the
snapshot history table and its nightly job, the CDS/RAP scaffolding, and wiring
to `ZCL_AB_V1_UT` and the Employee 360 views.

### Phase 1 — the ~70 low-risk read-only points
`read-only · CDS + standard RAP query · Fiori Elements + a card shell`

Data Quality, Security Monitor, Background Jobs, Integration Monitoring, Inbound
Message Monitor, OData/Gateway Monitor, Replication Summary, Error Analysis,
current-day KPI tiles, New Joiners, headcount donut, basic Payroll
(areas / runs / PCC if present), Alerts list (display-only). Freestyle dashboard
shell + Fiori Elements drill-downs.

### Phase 2 — the ~33 medium points
`snapshot-fed trends · freestyle visuals · cross-system · still read-only`

7/30/90-day trends once history has accrued, all "vs yesterday" deltas, Workflow
Overview + funnel, Org Structure tree, error-category refinement, certificate /
OAuth / RFC alerts, Performance panel, Transport Monitor (local + remote via
TMS RFC).

### CAP / BTP track — the 6 deferred points
`separate delivery · consumed into the same Fiori shell`

CPI message processing log and durations, true CPI/iFlow availability, SF
Recruiting & Performance, ECP payroll, SF/MDF workflow. Built on CAP against
SuccessFactors / Integration Suite APIs and surfaced as additional cards in the
same launchpad, exactly as Employee 360 is being split.

---

## Bottom line

~95% of the *presentation* is achievable in Fiori; ~64% of the data points
(~70 of ~110) are Phase-1 work in CDS + standard read-only RAP with little risk;
~30% are Phase-2 (freestyle charts, snapshot-fed trends, one TMS RFC); ~6%
genuinely need the CAP layer. The build is the Employee 360 pattern widened from
data health to full operations monitoring.
