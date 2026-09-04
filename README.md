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

> **Build status:** Stage 1 (Data Quality Overview) — pulled, activated clean,
> Fiori preview verified with real data (40,529 issues). Stage 2 (Security
> Monitor) source pushed, awaiting pull/activate. See
> `docs/BUILD_ISSUES_LOG.md` before touching any CDS in this repo — read §0
> first, every activation error goes there before the next stage is written.

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
| [`docs/BUILD_ISSUES_LOG.md`](docs/BUILD_ISSUES_LOG.md) | **Read before touching any ABAP** — pre-flight checklist + every activation error hit + fix |

## What's in `/src`

| Area | Objects | Stage |
|---|---|---|
| Interface CDS | `ZI_TWR_EMP_BASIC` (anchor), `ZI_TWR_EMP_CONTACT`, `ZI_TWR_EMP_BANK`, `ZI_TWR_DQ_ISSUE` (4-branch check union) | 1 ✅ |
| Consumption CDS | `ZC_TWR_DQ_ISSUE` (list), `ZC_TWR_DQ_SUMMARY` (donut by category) | 1 ✅ |
| Interface CDS | `ZI_TWR_SEC_USER` (anchor, `USR02`) | 2 🔄 |
| Consumption CDS | `ZC_TWR_SEC_USER` (list), `ZC_TWR_SEC_SUMMARY` (donut by lock status) | 2 🔄 |
| Service | `ZTWR_UI_SRVD` (exposes all of the above) + `ZTWR_UI_SRVB_O4` (OData V4 – UI, published, shipped in the repo) | 1+2 |

No RAP behavior definition, no custom DDIC tables, no DCL — every object is a
plain `define view entity … as select from`. Stage 1 checks: Missing Email,
Missing Cost Center, Missing Position (proxy for Invalid Position), Missing
Bank/IBAN. Duplicate Employee and Missing Manager are deferred — see
`docs/02_solution_architecture.md` §8.

## Pull & activate (Stage 2)

`VS-Tower` is already linked to `ZABAP_UTIL` (Stage 1 pull). To pick up Stage 2:

1. Pull the repo again — brings in `ZI_TWR_SEC_USER`, `ZC_TWR_SEC_USER`,
   `ZC_TWR_SEC_SUMMARY`, and the extended `ZTWR_UI_SRVD`.
2. Package → **Activate All Inactive ABAP Development Objects** (run twice if
   the first pass leaves cross-references inactive).
3. If `SecurityUser` / `SecuritySummary` don't show up in the service catalog
   immediately, re-publish `ZTWR_UI_SRVB_O4` — it references `ZTWR_UI_SRVD` by
   name/version, so a service definition change sometimes needs an explicit
   re-publish to pick up.
4. Preview: open `ZTWR_UI_SRVB_O4` → select `SecurityUser` or
   `SecuritySummary` → **Preview**.
5. **Report every activation error back verbatim** (object + full message) —
   it gets logged in `docs/BUILD_ISSUES_LOG.md` with the fix before the next
   stage is written.

## Post-pull (not in the repo)

- **SLG0** — not needed yet (no ABAP class/report in Stage 1).
- **Authorization** — none required by design. The dashboard tile itself is
  restricted to HR-and-above by Basis, outside this repo's scope.

## Stage roadmap

See `docs/02_solution_architecture.md` §8 for the full Stage 1–10 + Phase 2 +
CAP-track plan. Each stage is one abapGit pull, deployed and verified before
the next stage starts.
