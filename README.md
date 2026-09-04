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

> **Build status:** Stage 1 (Data Quality Overview) and Stage 2 (Security
> Monitor) both pulled, activated, and verified with real data (40,529 issues;
> 4,860 users — Stage 2 hit one conversion-exit error, fixed, see
> `docs/BUILD_ISSUES_LOG.md` T1). Stages 3–5 (Background Jobs, Transport
> Monitor, Headcount Overview) pushed and awaiting one combined pull — client
> is blocked by a VPN issue and will verify all three together. **Stages 4–5
> were reordered** from the original plan (Foundation config tables /
> Integration Monitoring) — see `docs/02_solution_architecture.md` §8 for why.
> Read `docs/BUILD_ISSUES_LOG.md` §0 before touching any CDS in this repo —
> every activation error goes there before the next stage is written.

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
| Interface CDS | `ZI_TWR_SEC_USER` (anchor, `USR02`) | 2 ✅ |
| Consumption CDS | `ZC_TWR_SEC_USER` (list), `ZC_TWR_SEC_SUMMARY` (donut by lock status) | 2 ✅ |
| Interface CDS | `ZI_TWR_BGJOB` (anchor, `TBTCO`) | 3 🔄 |
| Consumption CDS | `ZC_TWR_BGJOB` (list), `ZC_TWR_BGJOB_SUMMARY` (donut by status) | 3 🔄 |
| Interface CDS | `ZI_TWR_TRANSPORT` (anchor, `E070`, local system) | 4 🔄 |
| Consumption CDS | `ZC_TWR_TRANSPORT` (list), `ZC_TWR_TRANSPORT_SUMMARY` (donut by status) | 4 🔄 |
| Consumption CDS | `ZC_TWR_HEADCOUNT` (donut by company/personnel area — no new interface view, reuses Stage 1's `ZI_TWR_EMP_BASIC`) | 5 🔄 |
| Service | `ZTWR_UI_SRVD` (exposes all of the above) + `ZTWR_UI_SRVB_O4` (OData V4 – UI, published, shipped in the repo) | 1–5 |

Stages 4–5 are a **reordering** of the original plan — see
`docs/02_solution_architecture.md` §8 for why the config-table foundation and
Integration Monitoring stages were pushed back.

No RAP behavior definition, no custom DDIC tables, no DCL — every object is a
plain `define view entity … as select from`. Stage 1 checks: Missing Email,
Missing Cost Center, Missing Position (proxy for Invalid Position), Missing
Bank/IBAN. Duplicate Employee and Missing Manager are deferred — see
`docs/02_solution_architecture.md` §8.

## Pull & activate (Stages 3–5, combined)

`VS-Tower` is already linked to `ZABAP_UTIL`. One pull now brings in all three:

1. Pull the repo — brings in `ZI_TWR_BGJOB` + `ZC_TWR_BGJOB*` (Stage 3),
   `ZI_TWR_TRANSPORT` + `ZC_TWR_TRANSPORT*` (Stage 4), `ZC_TWR_HEADCOUNT`
   (Stage 5), and the extended `ZTWR_UI_SRVD`.
2. Package → **Activate All Inactive ABAP Development Objects** (run twice if
   the first pass leaves cross-references inactive).
3. If the new entities don't show up in the service catalog immediately,
   re-publish `ZTWR_UI_SRVB_O4`.
4. Preview each in turn: `BackgroundJob` / `BackgroundJobSummary`,
   `TransportRequestSet` / `TransportSummary`, `HeadcountOverview`.
5. **Report every activation error back verbatim** (object + full message,
   and which entity if it's a preview-time error) — each gets logged in
   `docs/BUILD_ISSUES_LOG.md` with its fix. Since three stages are landing at
   once, say which stage(s) came back clean too, not just the failures.

## Post-pull (not in the repo)

- **SLG0** — not needed yet (no ABAP class/report in Stage 1).
- **Authorization** — none required by design. The dashboard tile itself is
  restricted to HR-and-above by Basis, outside this repo's scope.

## Stage roadmap

See `docs/02_solution_architecture.md` §8 for the full Stage 1–10 + Phase 2 +
CAP-track plan. Each stage is one abapGit pull, deployed and verified before
the next stage starts.
