# VS-Tower

**VS SF Control Tower** — a read-only SAP Fiori dashboard for monitoring the
health of SuccessFactors ↔ S/4HANA HCM integration and the surrounding HR
operations, built on S/4HANA On-Premise with CDS + read-only RAP + OData V4.

- Platform: **S/4HANA On-Premise, Standard ABAP, OData V4**
- **Read-only** — no RAP actions, no write-back. The dashboard only displays.
- **No authorization logic in CDS or RAP** — access is controlled entirely at
  the Fiori launchpad / Basis layer (tile + catalog + PFCG), scoped to
  *HR and above* profiles. CDS/RAP return the full, org-wide dataset.
- ABAP scope = **on-prem monitoring only**. CPI / SuccessFactors / ECP-native
  data is a separate CAP / BTP track (mirrors the Employee 360 split).
- Pattern reuse: Employee 360 data-health CDS, Salary Master read-only RAP
  query, `ZCL_AB_V1_UT` utility framework.

## Status

**Pre-development.** Discussion and scoping only — no ABAP yet. Design docs are
approved before any object is created (Vernasoft rulebook).

See `docs/00_context_and_decisions.md` for locked decisions and the open
confirmations blocking the start of development.

## Repository layout

```
/docs   scoping, decisions, functional + technical design
/src    abapGit source — added once development starts
```

## Documents

| Doc | Purpose |
|---|---|
| [`docs/00_context_and_decisions.md`](docs/00_context_and_decisions.md) | Discussion log, locked decisions, open confirmations, next steps |
| [`docs/01_feasibility_map.md`](docs/01_feasibility_map.md) | Every dashboard tile → data points → on-prem source → phase (P1 / P2 / CAP) |
