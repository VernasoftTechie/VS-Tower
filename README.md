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

> **Build status:** Stages 1–6 all pulled, activated, and verified clean
> (Stage 2 — T1, conversion exit; Stage 3 — T2, blank date; Stage 6 —
> T3, labels; all fixed, see `docs/BUILD_ISSUES_LOG.md`). Stage 6's original
> design (interface catalog table) was retired on client direction (standard
> tables only, no customization — D9) and replaced with Payroll Area
> Overview. **Stage 3 just got a refinement — `BackgroundJobHealth`** — one
> row per job name, latest run only, pending/error only (client feedback:
> the old all-history view was too noisy to be useful). Pushed, pull
> pending. **Stage 7 (Integration Monitoring) is on hold**, not
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
| Consumption CDS | `ZC_TWR_BGJOB` (exposed as `BackgroundJobHistory`), `ZC_TWR_BGJOB_SUMMARY` (`BackgroundJobHistorySummary`) — full run history, unchanged | 3 ✅ |
| Interface CDS | `ZI_TWR_BGJOB_LATEST` (helper — `MAX(JobCount)` per job name), `ZI_TWR_BGJOB_HEALTH` (self-join, pending/error only) | 3 *(refined)* 🔄 |
| Consumption CDS | `ZC_TWR_BGJOB_HEALTH` (`BackgroundJobHealth` — **the primary Background Jobs tile**), `ZC_TWR_BGJOB_HEALTH_SUMMARY` | 3 *(refined)* 🔄 |
| Interface CDS | `ZI_TWR_TRANSPORT` (anchor, `E070`, local system) | 4 ✅ |
| Consumption CDS | `ZC_TWR_TRANSPORT` (list), `ZC_TWR_TRANSPORT_SUMMARY` (donut by status) | 4 ✅ |
| Consumption CDS | `ZC_TWR_HEADCOUNT` (donut by company/personnel area — no new interface view, reuses Stage 1's `ZI_TWR_EMP_BASIC`) | 5 ✅ |
| Consumption CDS | `ZC_TWR_PAYROLL_AREA` (donut by payroll area — no new interface view, reuses Stage 1's `ZI_TWR_EMP_BASIC`) | 6 ✅ |
| Service | `ZTWR_UI_SRVD` (exposes all of the above) + `ZTWR_UI_SRVB_O4` (OData V4 – UI, published, shipped in the repo) | 1–6 |

**Retired:** `ZTWR_CFG_IFACE` (table) + `ZI_TWR_CFG_IFACE` + `ZC_TWR_CFG_IFACE`
— removed from the repo 2026-09-04, client direction (no custom
config/catalog tables). If the corresponding objects are still in the target
system, a pull should have already offered to delete them.

No RAP behavior definition, no custom DDIC tables, no DCL — every object is a
plain `define view entity … as select from`. Stage 1 checks: Missing Email,
Missing Cost Center, Missing Position (proxy for Invalid Position), Missing
Bank/IBAN. Duplicate Employee and Missing Manager are deferred — see
`docs/02_solution_architecture.md` §8.

## Pull & activate (Stage 3 refinement — Background Job Health)

`VS-Tower` is already linked to `ZABAP_UTIL`.

1. Pull the repo — brings in `ZI_TWR_BGJOB_LATEST` (helper),
   `ZI_TWR_BGJOB_HEALTH` (self-join), `ZC_TWR_BGJOB_HEALTH`,
   `ZC_TWR_BGJOB_HEALTH_SUMMARY`, and the extended/renamed `ZTWR_UI_SRVD`.
   `ZI_TWR_BGJOB`/`ZC_TWR_BGJOB`/`ZC_TWR_BGJOB_SUMMARY` themselves are
   **unchanged** — only their exposed OData entity-set names changed
   (`BackgroundJob` → `BackgroundJobHistory`, `BackgroundJobSummary` →
   `BackgroundJobHistorySummary`).
2. Package → **Activate All Inactive ABAP Development Objects** (run twice if
   the first pass leaves cross-references inactive). This pull's newest
   construct is the self-join in `ZI_TWR_BGJOB_HEALTH` — treat any error
   there as high-priority to report verbatim.
3. Preview **`BackgroundJobHealth`** — should show far fewer rows than
   before: one per job name, its latest run only, none with status
   "finished."
4. Preview `BackgroundJobHistory` — should look exactly as `BackgroundJob`
   did before (same CDS, only the exposed name changed) — confirms the
   rename alone didn't disturb anything.
5. Report back clean/error, and roughly how many rows `BackgroundJobHealth`
   returns vs. `BackgroundJobHistory`.

## Post-pull (not in the repo)

- **SLG0** — not needed yet (no ABAP class/report built yet).
- **Authorization** — none required by design. The dashboard tile itself is
  restricted to HR-and-above by Basis, outside this repo's scope.

## Stage roadmap

See `docs/02_solution_architecture.md` §8 for the current plan, including the
Stage 6 retirement/replacement, the Stage 3 refinement (§24), and why Stage 7
is on hold. Each stage is one abapGit pull, deployed and verified before the
next stage starts.
