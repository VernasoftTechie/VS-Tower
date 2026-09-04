# VS-Tower

**VS SF Control Tower** — a read-only SAP Fiori dashboard for monitoring the
health of SuccessFactors ↔ S/4HANA HCM integration and the surrounding HR
operations, built on S/4HANA On-Premise with CDS + read-only RAP + OData V4.

- Platform: **S/4HANA On-Premise, Standard ABAP, OData V4**
- **Read-only** — no RAP actions, no write-back, no behavior definition anywhere.
- **No authorization logic in CDS or RAP** — `@AccessControl.authorizationCheck: #NOT_REQUIRED`
  on every entity, no DCL. Access is controlled entirely at the Fiori
  launchpad / Basis layer (tile + catalog + PFCG), scoped to *HR and above*.
- ABAP scope = **on-prem monitoring only**. CPI / SuccessFactors / ECP-native
  data is a separate CAP / BTP track (mirrors the Employee 360 split).
- Package: **`ZABAP_UTIL`** (confirmed — shared with `Utility-Class-and-Method`;
  operational note in `docs/02_solution_architecture.md` §3).
- Built to the **Vernasoft ABAP & RAP Engineering Rulebook v1.0**.

> **Build status:** Stages 1, 2, 4, 5 pulled, activated, and verified clean
> (Stage 2 hit one conversion-exit error, fixed — `docs/BUILD_ISSUES_LOG.md`
> T1). Stage 3 activated clean but a blank date broke it at runtime (T2) —
> took three attempts to pin down; fixed by exposing those fields as text
> instead of `Edm.Date`. Stage 6 (interface catalog table) activated clean
> but showed wrong filter/column labels (T3 — a reused data element resolved
> to an unrelated label on this system); fixed with explicit labels. Both
> fixes bundled into one commit, awaiting re-verify. **Stage 7 (Integration
> Monitoring) is blocked on data from the SAP Basis team** — see
> `docs/03_stage7_data_collection.md`. Read `docs/BUILD_ISSUES_LOG.md` §0
> before touching any CDS in this repo — every activation error goes there
> before the next stage is written.

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
| [`docs/03_stage7_data_collection.md`](docs/03_stage7_data_collection.md) | **Blocks Stage 7** — what interface data is needed and how to gather it |
| [`docs/BUILD_ISSUES_LOG.md`](docs/BUILD_ISSUES_LOG.md) | **Read before touching any ABAP** — pre-flight checklist + every activation error hit + fix |

## What's in `/src`

| Area | Objects | Stage |
|---|---|---|
| Interface CDS | `ZI_TWR_EMP_BASIC` (anchor), `ZI_TWR_EMP_CONTACT`, `ZI_TWR_EMP_BANK`, `ZI_TWR_DQ_ISSUE` (4-branch check union) | 1 ✅ |
| Consumption CDS | `ZC_TWR_DQ_ISSUE` (list), `ZC_TWR_DQ_SUMMARY` (donut by category) | 1 ✅ |
| Interface CDS | `ZI_TWR_SEC_USER` (anchor, `USR02`) | 2 ✅ |
| Consumption CDS | `ZC_TWR_SEC_USER` (list), `ZC_TWR_SEC_SUMMARY` (donut by lock status) | 2 ✅ |
| Interface CDS | `ZI_TWR_BGJOB` (anchor, `TBTCO`) | 3 🔄 |
| Consumption CDS | `ZC_TWR_BGJOB` (list), `ZC_TWR_BGJOB_SUMMARY` (donut by status) | 3 🔄 |
| Interface CDS | `ZI_TWR_TRANSPORT` (anchor, `E070`, local system) | 4 🔄 |
| Consumption CDS | `ZC_TWR_TRANSPORT` (list), `ZC_TWR_TRANSPORT_SUMMARY` (donut by status) | 4 🔄 |
| Consumption CDS | `ZC_TWR_HEADCOUNT` (donut by company/personnel area — no new interface view, reuses Stage 1's `ZI_TWR_EMP_BASIC`) | 5 ✅ |
| Table + Interface CDS | `ZTWR_CFG_IFACE` (empty interface catalog), `ZI_TWR_CFG_IFACE` (anchor) | 6 🔄 |
| Consumption CDS | `ZC_TWR_CFG_IFACE` (list, for maintenance visibility) | 6 🔄 |
| Service | `ZTWR_UI_SRVD` (exposes all of the above) + `ZTWR_UI_SRVB_O4` (OData V4 – UI, published, shipped in the repo) | 1–6 |

Stages 4–5 were a **reordering** of the original plan (both now done) — see
`docs/02_solution_architecture.md` §8. Stage 6 is the narrowed foundation
(one table, not four — §20). **Stage 7 needs data from you** —
`docs/03_stage7_data_collection.md`.

No RAP behavior definition, no custom DDIC tables, no DCL — every object is a
plain `define view entity … as select from`. Stage 1 checks: Missing Email,
Missing Cost Center, Missing Position (proxy for Invalid Position), Missing
Bank/IBAN. Duplicate Employee and Missing Manager are deferred — see
`docs/02_solution_architecture.md` §8.

## Pull & activate (Stage 6 + fixes for T2 and T3)

`VS-Tower` is already linked to `ZABAP_UTIL`. One pull covers everything below.

1. Pull the repo — brings in `ZTWR_CFG_IFACE` (a **table**, first use of that
   object type in this repo), `ZI_TWR_CFG_IFACE`, `ZC_TWR_CFG_IFACE`, the
   extended `ZTWR_UI_SRVD`, the **T2** fix (`BackgroundJob`'s date fields are
   now text, not `Edm.Date`), and the **T3** fix (explicit labels on the
   interface catalog).
2. Package → **Activate All Inactive ABAP Development Objects** (run twice if
   the first pass leaves cross-references inactive). Treat any error on the
   table activation itself as high-priority to report verbatim.
3. Re-check `BackgroundJob` — use the `Job Name` filter again; `StartDate`
   etc. will now display as plain text rather than a formatted date.
4. Preview `InterfaceCatalog` on `ZTWR_UI_SRVB_O4` — **0 rows is still the
   correct result** (the table ships empty); check the filter/column labels
   now read "Interface ID" / "Owner" / "Active" etc.
5. Report back clean/error for both.

Stage 7 is blocked on data from the SAP Basis team, not on you pulling/testing
— see `docs/03_stage7_data_collection.md` for what to gather and how.

## Post-pull (not in the repo)

- **SLG0** — not needed yet (no ABAP class/report in Stage 1).
- **Authorization** — none required by design. The dashboard tile itself is
  restricted to HR-and-above by Basis, outside this repo's scope.

## Stage roadmap

See `docs/02_solution_architecture.md` §8 for the full Stage 1–10 + Phase 2 +
CAP-track plan. Each stage is one abapGit pull, deployed and verified before
the next stage starts.
