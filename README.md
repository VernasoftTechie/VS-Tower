# VS-Tower

**VS SF Control Tower** — a read-only SAP Fiori dashboard for monitoring the
health of SuccessFactors ↔ S/4HANA HCM integration and the surrounding HR
operations, built on S/4HANA On-Premise with CDS + read-only RAP + OData V4.

- Platform: **S/4HANA On-Premise, Standard ABAP, OData V4**
- **Read-only** — no RAP actions, no write-back, no behavior definition anywhere.
- **No authorization logic in CDS or RAP** — `@AccessControl.authorizationCheck: #NOT_REQUIRED`
  on every entity, no DCL. Access is controlled entirely at the Fiori
  launchpad / Basis layer (tile + catalog + PFCG), scoped to *HR and above*.
- **Standard tables only** — no custom config/catalog tables (decision D9).
  A panel that can't be built from standard tables alone is parked, not
  worked around with a Z table.
- ABAP scope = **on-prem monitoring only**. CPI / SuccessFactors / ECP-native
  data is a separate CAP / BTP track (mirrors the Employee 360 split).
- Package: **`ZABAP_UTIL`** (confirmed — shared with `Utility-Class-and-Method`;
  operational note in `docs/02_solution_architecture.md` §3).
- Built to the **Vernasoft ABAP & RAP Engineering Rulebook v1.0**.

> **🏁 CDS layer closed, 2026-09-05.** Stages 1–6 plus four refinements
> (Duplicate Employee, Background Job Health, Transport by Type, Headcount by
> Group) are all pulled, activated, and confirmed clean (T1/T2/T3 fixed along
> the way, see `docs/BUILD_ISSUES_LOG.md`). Everything that's safely
> buildable from standard tables, with no new external information, is now
> built. Everything still open is a **deliberate stop, not an oversight** —
> full reasoning per item in `docs/00_context_and_decisions.md` §7: needs
> real client data (Stage 7, New Joiners), needs an `SE11` field check
> (Payroll status, Gateway stats), is a known-fragile pattern
> (org hierarchy), needs a non-CDS object (cert expiry), is reframed as a
> UI-layer concern (Alerts), or was always Phase 2 / the separate CAP track.
> **Next: Fiori UI / dashboard-design**, a separate round on the client's own
> timing — nothing more to build in CDS until then, or until one of the open
> items gets unblocked. Read `docs/BUILD_ISSUES_LOG.md` §0 before touching
> any CDS in this repo regardless.

---

## Repository layout

```
/docs   scoping, decisions, architecture, build issues log
/src    abapGit source — STARTING_FOLDER=/src/, FOLDER_LOGIC=PREFIX
```

## Documents

| Doc | Purpose |
|---|---|
| [`docs/00_context_and_decisions.md`](docs/00_context_and_decisions.md) | Discussion log, locked decisions, confirmations received — **§7 is the CDS-layer closure**: what's not built and why |
| [`docs/01_feasibility_map.md`](docs/01_feasibility_map.md) | Every dashboard tile → data points → on-prem source → phase (P1 / P2 / CAP) |
| [`docs/02_solution_architecture.md`](docs/02_solution_architecture.md) | Layering, naming, reuse strategy, rulebook deviations, stage roadmap |
| [`docs/03_stage7_data_collection.md`](docs/03_stage7_data_collection.md) | **On hold** — kept for reference if Stage 7 is picked back up later |
| [`docs/BUILD_ISSUES_LOG.md`](docs/BUILD_ISSUES_LOG.md) | **Read before touching any ABAP** — pre-flight checklist + every activation error hit + fix |
| [`docs/04_fiori_ui_design.md`](docs/04_fiori_ui_design.md) | Fiori Elements Overview Page recommendation, card map, launchpad tile — for the Fiori developer |

## What's in `/src`

| Area | Objects | Stage |
|---|---|---|
| Interface CDS | `ZI_TWR_EMP_BASIC` (anchor — includes `PayrollArea`, `EmployeeGroup`, `EmployeeSubgroup`), `ZI_TWR_EMP_CONTACT`, `ZI_TWR_EMP_BANK`, `ZI_TWR_DQ_ISSUE` (5-branch check union) | 1 ✅ |
| Consumption CDS | `ZC_TWR_DQ_ISSUE` (list), `ZC_TWR_DQ_SUMMARY` (donut by category) | 1 ✅ |
| Interface CDS | `ZI_TWR_EMP_DUP_KEY` (helper — name+DOB match count) | 1 *(refined)* ✅ |
| Interface CDS | `ZI_TWR_SEC_USER` (anchor, `USR02`) | 2 ✅ |
| Consumption CDS | `ZC_TWR_SEC_USER` (list), `ZC_TWR_SEC_SUMMARY` (donut by lock status) | 2 ✅ |
| Interface CDS | `ZI_TWR_BGJOB` (anchor, `TBTCO` — date/time fields are text, see T2) | 3 ✅ |
| Consumption CDS | `ZC_TWR_BGJOB` (exposed as `BackgroundJobHistory`), `ZC_TWR_BGJOB_SUMMARY` (`BackgroundJobHistorySummary`) — full run history, unchanged | 3 ✅ |
| Interface CDS | `ZI_TWR_BGJOB_LATEST` (helper — `MAX(JobCount)` per job name), `ZI_TWR_BGJOB_HEALTH` (self-join, pending/error only) | 3 *(refined)* ✅ |
| Consumption CDS | `ZC_TWR_BGJOB_HEALTH` (`BackgroundJobHealth` — **the primary Background Jobs tile**), `ZC_TWR_BGJOB_HEALTH_SUMMARY` | 3 *(refined)* ✅ |
| Interface CDS | `ZI_TWR_TRANSPORT` (anchor, `E070`, local system) | 4 ✅ |
| Consumption CDS | `ZC_TWR_TRANSPORT` (list), `ZC_TWR_TRANSPORT_SUMMARY` (donut by status) | 4 ✅ |
| Consumption CDS | `ZC_TWR_TRANSPORT_TYPE_SUMMARY` (donut by request type) | 4 *(refined)* ✅ |
| Consumption CDS | `ZC_TWR_HEADCOUNT` (donut by company/personnel area — no new interface view, reuses Stage 1's `ZI_TWR_EMP_BASIC`) | 5 ✅ |
| Consumption CDS | `ZC_TWR_HEADCOUNT_BY_GROUP` (donut by employee group/subgroup — same reuse) | 5 *(refined)* ✅ |
| Consumption CDS | `ZC_TWR_PAYROLL_AREA` (donut by payroll area — no new interface view, reuses Stage 1's `ZI_TWR_EMP_BASIC`) | 6 ✅ |
| Service | `ZTWR_UI_SRVD` (exposes all of the above) + `ZTWR_UI_SRVB_O4` (OData V4 – UI, published, shipped in the repo) | 1–6 |

**Retired:** `ZTWR_CFG_IFACE` (table) + `ZI_TWR_CFG_IFACE` + `ZC_TWR_CFG_IFACE`
— removed from the repo 2026-09-04, client direction (no custom
config/catalog tables). If the corresponding objects are still in the target
system, a pull should have already offered to delete them.

No RAP behavior definition, no custom DDIC tables, no DCL — every object is a
plain `define view entity … as select from`. Stage 1 checks: Missing Email,
Missing Cost Center, Missing Position (proxy for Invalid Position), Missing
Bank/IBAN, and now Duplicate Employee. Missing Manager is still deferred —
see `docs/02_solution_architecture.md` §26.

## CDS layer: closed for this round

Everything above is pulled, activated, and confirmed clean by the client.
There is nothing further queued to pull. The next round of work is the Fiori
UI/dashboard design — a separate decision on the client's own timing — not
more CDS. If any of the "closed for this round" items in
`docs/02_solution_architecture.md` §8 gets unblocked (real interface data,
an `SE11` field check, a D9 answer on Alerts/snapshot), that becomes its own
stage at that point.

## Post-pull (not in the repo)

- **SLG0** — not needed yet (no ABAP class/report built yet).
- **Authorization** — none required by design. The dashboard tile itself is
  restricted to HR-and-above by Basis, outside this repo's scope.

## Stage roadmap

See `docs/02_solution_architecture.md` §8 for the current plan, including the
Stage 6 retirement/replacement, the Stage 3 refinement (§24), the Stage 1
refinement (§26), the Stage 4/5 refinements (§28), and why Stage 7 is on
hold. Each stage is one abapGit pull, deployed and verified before the next
stage starts.
