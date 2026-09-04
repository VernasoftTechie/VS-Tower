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

> **Build status:** Stages 1, 2, 3, 4, 5 all pulled, activated, and verified
> clean (Stage 2 hit a conversion-exit error — T1; Stage 3 took three
> attempts to pin down a blank-date runtime error — T2; both fixed, see
> `docs/BUILD_ISSUES_LOG.md`). Stage 6 was originally an interface catalog
> table — activated clean, needed one labelling fix (T3), then was
> **retired outright** on client direction (standard tables only, no
> customization) and **replaced** with Payroll Area Overview (pushed,
> awaiting pull). **Stage 7 (Integration Monitoring) is on hold**, not
> blocked-and-waiting — see `docs/03_stage7_data_collection.md`. Read
> `docs/BUILD_ISSUES_LOG.md` §0 before touching any CDS in this repo — every
> activation error goes there before the next stage is written.

---

## Repository layout

```
/docs   scoping, decisions, architecture, build issues log
/src    abapGit source — STARTING_FOLDER=/src/, FOLDER_LOGIC=PREFIX
```

## Documents

| Doc | Purpose |
|---|---|
| [`docs/00_context_and_decisions.md`](docs/00_context_and_decisions.md) | Discussion log, locked decisions, confirmations received |
| [`docs/01_feasibility_map.md`](docs/01_feasibility_map.md) | Every dashboard tile → data points → on-prem source → phase (P1 / P2 / CAP) |
| [`docs/02_solution_architecture.md`](docs/02_solution_architecture.md) | Layering, naming, reuse strategy, rulebook deviations, stage roadmap |
| [`docs/03_stage7_data_collection.md`](docs/03_stage7_data_collection.md) | **On hold** — kept for reference if Stage 7 is picked back up later |
| [`docs/BUILD_ISSUES_LOG.md`](docs/BUILD_ISSUES_LOG.md) | **Read before touching any ABAP** — pre-flight checklist + every activation error hit + fix |

## What's in `/src`

| Area | Objects | Stage |
|---|---|---|
| Interface CDS | `ZI_TWR_EMP_BASIC` (anchor — includes `PayrollArea`), `ZI_TWR_EMP_CONTACT`, `ZI_TWR_EMP_BANK`, `ZI_TWR_DQ_ISSUE` (4-branch check union) | 1 ✅ |
| Consumption CDS | `ZC_TWR_DQ_ISSUE` (list), `ZC_TWR_DQ_SUMMARY` (donut by category) | 1 ✅ |
| Interface CDS | `ZI_TWR_SEC_USER` (anchor, `USR02`) | 2 ✅ |
| Consumption CDS | `ZC_TWR_SEC_USER` (list), `ZC_TWR_SEC_SUMMARY` (donut by lock status) | 2 ✅ |
| Interface CDS | `ZI_TWR_BGJOB` (anchor, `TBTCO` — date/time fields are text, see T2) | 3 ✅ |
| Consumption CDS | `ZC_TWR_BGJOB` (list), `ZC_TWR_BGJOB_SUMMARY` (donut by status) | 3 ✅ |
| Interface CDS | `ZI_TWR_TRANSPORT` (anchor, `E070`, local system) | 4 ✅ |
| Consumption CDS | `ZC_TWR_TRANSPORT` (list), `ZC_TWR_TRANSPORT_SUMMARY` (donut by status) | 4 ✅ |
| Consumption CDS | `ZC_TWR_HEADCOUNT` (donut by company/personnel area — no new interface view, reuses Stage 1's `ZI_TWR_EMP_BASIC`) | 5 ✅ |
| Consumption CDS | `ZC_TWR_PAYROLL_AREA` (donut by payroll area — no new interface view, reuses Stage 1's `ZI_TWR_EMP_BASIC`) | 6 🔄 |
| Service | `ZTWR_UI_SRVD` (exposes all of the above) + `ZTWR_UI_SRVB_O4` (OData V4 – UI, published, shipped in the repo) | 1–6 |

**Retired:** `ZTWR_CFG_IFACE` (table) + `ZI_TWR_CFG_IFACE` + `ZC_TWR_CFG_IFACE`
— removed from the repo 2026-09-04, client direction (no custom
config/catalog tables). If the corresponding objects are still in the target
system, the next abapGit pull will likely offer to delete them — safe to
accept, they were empty and unused. Full reasoning:
`docs/02_solution_architecture.md` §20.

No RAP behavior definition, no custom DDIC tables, no DCL — every object is a
plain `define view entity … as select from`. Stage 1 checks: Missing Email,
Missing Cost Center, Missing Position (proxy for Invalid Position), Missing
Bank/IBAN. Duplicate Employee and Missing Manager are deferred — see
`docs/02_solution_architecture.md` §8.

## Pull & activate (Stage 6 replacement, plus the Stage 3 T2 fix)

`VS-Tower` is already linked to `ZABAP_UTIL`. One pull covers everything below.

1. Pull the repo — brings in the `PayrollArea` field on `ZI_TWR_EMP_BASIC`,
   the new `ZC_TWR_PAYROLL_AREA`, the extended `ZTWR_UI_SRVD`, and the
   **T2** fix (`BackgroundJob`'s date fields are now text, not `Edm.Date`).
   It also **removes** `ZTWR_CFG_IFACE` and its two CDS views from the repo
   tree.
2. Package → **Activate All Inactive ABAP Development Objects** (run twice if
   the first pass leaves cross-references inactive). Expect abapGit to also
   offer **deleting** the now-repo-absent interface-catalog objects — accept
   that, they were empty and unused.
3. Re-check `BackgroundJob` — use the `Job Name` filter again; `StartDate`
   etc. will now display as plain text (e.g. `20260904`) rather than a
   formatted date.
4. Preview `PayrollAreaOverview` on `ZTWR_UI_SRVB_O4` — should show one row
   per payroll area actually in use, with a headcount.
5. Report back clean/error for both.

Stage 7 is on hold, not waiting on you — nothing to pull or test for it.

## Post-pull (not in the repo)

- **SLG0** — not needed yet (no ABAP class/report built yet).
- **Authorization** — none required by design. The dashboard tile itself is
  restricted to HR-and-above by Basis, outside this repo's scope.

## Stage roadmap

See `docs/02_solution_architecture.md` §8 for the current plan, including the
Stage 6 retirement/replacement and why Stage 7 is on hold. Each stage is one
abapGit pull, deployed and verified before the next stage starts.
