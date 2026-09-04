# VS-Tower — Solution Architecture (Doc 02)

**Project:** VS SF Control Tower — read-only operations-monitoring dashboard
**Repository:** https://github.com/VernasoftTechie/VS-Tower.git
**Status:** APPROVED for Stage 1 build. Built to the *Vernasoft ABAP & RAP
Engineering Rulebook v1.0*.
**Depends on:** `00_context_and_decisions.md` (decisions D1–D7), `01_feasibility_map.md`

---

## 1. Confirmations received this round

| # | Question | Answer |
|---|---|---|
| — | On-prem SAP Payroll or ECP? | **On-prem SAP Payroll.** Confirmed — Section I (`01_feasibility_map.md`) stays in ABAP scope. |
| — | Payroll Control Center licensed? | **Unknown.** Non-blocking — see §2. |
| — | Inbound replication technique (IDoc/SOAP/AIF/PTP)? | **Not fixed** — resolved by design, not by answer. See §2. |
| — | Trusted TMS RFC to domain controller? | **Not needed yet** — Transport Monitor is Phase 2. See §2. |
| — | Package | **Flagged, not confirmed** — see §3. Proceeding on a safe default. |

## 2. Why those three questions were asked, and why they don't block Stage 1

**Payroll Control Center (PCC).** It's SAP's own payroll-monitoring add-on —
if licensed, it ships released CDS (`I_PayrollProcess*`) and standard Fiori
apps that would cover most of the Payroll Dashboard for very little build
effort. Not knowing is fine: Stage build for Payroll (later stage) targets the
**base tables** (`T549A`, `T569V`, `TBTCO`) that always exist, regardless of
PCC. If PCC turns out to be active, that stage gets cheaper, not blocked.

**Inbound replication technique.** IDoc, SOAP/SRT, AIF and PTP each log to a
*different* table (`EDIDC/EDIDS` vs `SRT_MONI` vs `/AIF/*`). Rather than wait
for the answer, decision **D6** (config-driven monitoring, already locked)
solves it structurally: the interface catalog (Stage 4, foundation) carries a
**"log technique" field per interface**, and each interface's Integration
Monitoring row reads from whichever table its own config says. One interface
can be IDoc-based while another is SOAP-based — no redesign needed either way.
This question only matters when we build the *first real interface row* in
Stage 5+; it doesn't block Stage 1 (Data Quality) at all.

**Trusted TMS RFC.** Only needed for the *remote* half of Transport Monitor
(import status in QA/Prod), which is Phase 2 by design. Local-system transport
requests (`E070`) need no RFC and are Phase 1. Non-blocking today.

## 3. Package — confirmed `ZABAP_UTIL`

Round 1 flagged that `ZABAP_UTIL` is already the linked, owning package of the
separate, deployed `Utility-Class-and-Method` repo, breaking the
one-package-per-repo pattern every other Vernasoft repo uses. **Client
confirmed `ZABAP_UTIL` explicitly after that flag** — proceeding on it.

**Operational consequence, recorded once and not re-litigated:** two abapGit
repos are now scoped to the same package. A "pull" / "Activate All Inactive"
in *either* repo enumerates every object physically in `ZABAP_UTIL`, so each
repo's tooling will now also see the other's objects (`ZAB_V1_UT_*` visible
from `VS-Tower`'s side; `ZI_TWR_*` / `ZC_TWR_*` / `ZTWR_*` visible from
`Utility-Class-and-Method`'s side). Neither repo's own `/src` git tree changes
because of this — abapGit only stages what's in that repo's tree — but a
manual "add to repository" or "remove" action taken on the *wrong* repo's
screen could cross-contaminate. Practical mitigation: **this repo does not
ship its own `package.devc.xml`** (removed after the first commit) — package
description ownership stays with `Utility-Class-and-Method`, avoiding a
two-repo fight over the package's own metadata. Always double check which
repo's screen a pull/activate/stage is being done from.

`ZABAP_UTIL` already exists and is already linked to `Utility-Class-and-Method`
— no new package to create. Just link the **`VS-Tower`** abapGit repo to the
existing `ZABAP_UTIL` package and pull.

## 4. Layering — read-only only, no BDEF

Per decision **D1** (read-only dashboard, no RAP actions anywhere), and
following Employee-360's own proven fallback (`BUILD_ISSUES_LOG.md` A19: a
`strict` unmanaged BDEF forces lock flags and operation wiring that a pure
read-only entity doesn't have, and isn't worth fighting):

```
Standard tables (PA/OM/USR02/TBTCO/…)
        ↓
Interface CDS   ZI_TWR_*     plain "define view entity … as select from"
        ↓
Consumption CDS ZC_TWR_*     plain "define view entity … as select from"
                             (never "as projection on" — no BO, no BDEF)
        ↓
Service Definition  ZTWR_UI_SRVD
        ↓
Service Binding      ZTWR_UI_SRVB_O4   (OData V4 – UI)
        ↓
Fiori (freestyle shell + Fiori Elements drill-downs)
```

No behavior definition, no behavior pool, anywhere in this repo. Every entity
carries `@AccessControl.authorizationCheck: #NOT_REQUIRED` (decision **D2** —
no CDS/RAP authorization; Basis owns the Fiori tile). No DCL objects.

## 5. Naming

| Object | Prefix (rulebook §4) | This repo |
|---|---|---|
| Package | Always ask | `ZABAP_UTIL` (confirmed, §3) |
| CDS Interface | `ZI_` | `ZI_TWR_<AREA>` |
| CDS Consumption | `ZC_` | `ZC_TWR_<AREA>` |
| Service Definition | — | `ZTWR_UI_SRVD` |
| Service Binding | — | `ZTWR_UI_SRVB_O4` |
| Class | `ZCL_` | `ZCL_TWR_<AREA>` (from Stage 4 onward, snapshot/check jobs) |
| Tables | `ZT_` | `ZTWR_<AREA>` (Stage 4 onward — config/snapshot/alert tables) |
| Messages | `ZMSG_` | `ZMSG_TWR` (introduced with the first ABAP class, not before) |

## 6. Reuse strategy — pattern, not object

VS-Tower does **not** consume Employee-360's CDS entities directly, even where
the data overlaps (both read PA0001/PA0002/PA0009/PA0105). Two reasons:

1. Employee-360's anchor (`ZI_HR360_EMP_BASIC`) carries `@AccessControl.authorizationCheck: #CHECK`
   + a DCL. Consuming it would silently reintroduce the authorization
   dependency decision D2 explicitly rules out (see `BUILD_ISSUES_LOG.md` §0.18).
2. Two independently-deployed abapGit repos should not hold a hard object
   dependency on each other — either one's refactor breaks the other.

Instead, VS-Tower defines its **own** small interface views, using field names
and casts **already proven correct on this exact system** by Employee-360's
build history (`BUILD_ISSUES_LOG.md` §1 table). This is a few dozen lines of
duplication in exchange for zero cross-repo coupling and zero re-litigating of
already-solved field-name/cast problems. `ZCL_AB_V1_UT` (from `ZABAP_UTIL`) is
reused directly by **calling** its methods once VS-Tower has its own ABAP
classes (Stage 4+) — that is genuine "build once, reuse everywhere."

## 7. Accepted deviations from the Rulebook

| # | Deviation | Rulebook clause | Rationale | Mitigation |
|---|---|---|---|---|
| 1 | No `AUTHORITY-CHECK`, no DCL, anywhere in this repo | §6 Security: "Authorization strategy, AUTHORITY-CHECK" | Explicit, repeated client instruction (decision D2): the dashboard is HR-and-above only, enforced entirely at the Fiori tile/PFCG layer by Basis; CDS/RAP return the full dataset by design. | Recorded here for audit/governance sign-off. If the access model ever needs row-level scoping, it is added as DCL at that point — not assumed now. |
| 2 | Custom Z tables (config catalog, snapshot history, alert store) — not "zero custom DDIC" | §1 "Build once, reuse everywhere" read narrowly | No standard SAP persistence exists for "which interfaces/jobs/checks to watch" or for history beyond SLG1/SRT_MONI's short retention (`01_feasibility_map.md` §21, §24). | Kept to the minimum: config + snapshot + alert store only, introduced in Stage 4, never used to duplicate data that a released CDS view already provides. |

## 8. Stage roadmap

Each stage is one abapGit pull + activation round, deployed and verified by
the client before the next stage starts (their "safe mode," proven on
Employee-360). Maps onto the Phase 1 / Phase 2 / CAP split in
`01_feasibility_map.md` §25.

| Stage | Status | Delivers | Feasibility map section | New custom DDIC? |
|---|---|---|---|---|
| **1** | ✅ **Done** — pulled, activated clean, preview verified with real data (40,529 issues) | Data Quality Overview — Missing Email / Cost Center / Position / Bank | §10 (G) | None |
| **2** | ✅ **Done** — activation hit T1 (`USTYP` conversion exit), fixed, preview verified (4,860 users) | Security Monitor — locked users, password age, technical users | §19 (P) | None |
| **3** | ✅ **Done** — pulled, activated, previewed clean (client tested all of 3–5 together) | Background Jobs Monitor | §14 (K) | None |
| **4** | ✅ **Done** | **Reordered** — Transport Monitor, local system only (was: Foundation config tables) | §20 (Q) | None |
| **5** | ✅ **Done** | **Reordered** — Headcount Overview by Company Code × Personnel Area (was: Integration Monitoring) | §16 (M, partial) | None |
| **6** | 🔄 Pushed, pull pending (this commit) | Foundation, narrowed — interface catalog only (`ZTWR_CFG_IFACE`). Watched-jobs catalog / alert config / snapshot history deferred until their consuming stages (Alerts, Trends) are ready | §21 (R) | `ZTWR_CFG_IFACE` |
| 7 | **Blocked — needs data from you**, see §20 | Integration Monitoring + Inbound Message Monitor (reads Stage 6 catalog) | §6 (C), §7 (D) | `ZTWR_ALERT` (alert store) |
| 8 | Not started | OData / Gateway Monitor | §8 (E) | None |
| 9 | Not started | Replication Summary & Error Analysis | §9 (F) | None |
| 10 | Not started | Remaining KPI tiles, org tree/region donut, New Joiners | §5 (B), §16 (M), §17 (N) | None |
| 11 | Not started | Payroll basics (areas, runs, PCC-if-present) | §12 (I) | None |
| 12 | Not started | Alerts list (display-only) + duplicate-employee / extended DQ checks | §15 (L), §10 (G) | None |
| — | Not started | Freestyle dashboard shell assembling Stages 1–12; Fiori Elements drill-downs per entity | §21 (R) | — |
| Phase 2 | Not started | Trends (needs Stage 6-family snapshot history), Workflow + funnel, remote Transport Monitor (TMS RFC), cert/OAuth/RFC alerts, Performance panel | `01_feasibility_map.md` §25 | per section |
| CAP track | Not started | CPI MPL, SF Recruiting/Performance, ECP payroll, SF workflow | `01_feasibility_map.md` §22 | separate repo |

### Why Stages 4–5 were reordered

The client asked to keep building ahead while blocked by a VPN issue, so
Stages 3–5 will be pulled and verified together rather than one gate at a
time. Given that, the **original** Stage 4 (config tables) and Stage 5
(Integration Monitoring) were deliberately *not* built next:

- **Foundation config tables** need a new abapGit object type this repo has
  never used — `TABL` (custom database tables). The one proven example in
  this toolchain (`Utility-Class-and-Method`'s `ZAB_V1_UT_ADPT`) relies on a
  custom data element for one of its fields — first-time risk on an object
  type with a stricter, less forgiving schema than CDS. And nothing in this
  repo actually **consumes** those tables yet (Integration Monitoring, the
  only stage that needs them, is itself deferred — see below), so building
  them now is exactly the unused-scaffolding pattern Employee-360's own log
  warns against (G2). Better to build it once it's needed and verifiable.
- **Integration Monitoring** needs real interface names and their log
  technique (IDoc/SOAP/AIF/PTP) to mean anything (`00_context_and_decisions.md`
  §5 item 3). That's client-specific business information this session
  doesn't have — guessing it would repeat exactly the kind of fabricated
  specific the rest of this repo has been careful to avoid.

**Substituted instead:** Transport Monitor (local) and Headcount Overview —
both zero-new-object-type, zero-business-config-unknown, and built the same
proven "own anchor + plain select from + defensive cast" shape as Stages 1–3.
Headcount reuses `ZI_TWR_EMP_BASIC` directly — no new interface view at all.

## 12. What ships in this commit (Stage 2)

| Object | Type | Purpose |
|---|---|---|
| `ZI_TWR_SEC_USER` | Interface CDS | Anchor: one row per `USR02` user master record, with `IsLocked`/`LockCriticality` computed from `UFLAG` |
| `ZC_TWR_SEC_USER` | Consumption CDS | Query view + minimal `@UI` for a List Report, criticality on lock status |
| `ZC_TWR_SEC_SUMMARY` | Consumption CDS | Aggregated by `UserType` × `IsLocked`, for the donut |
| `ZTWR_UI_SRVD` (extended) | Service Definition | Now exposes `SecurityUser` and `SecuritySummary` alongside the Stage 1 entities |

`ZTWR_UI_SRVB_O4` (the binding) is unchanged — it references `ZTWR_UI_SRVD` by
name/version, not by an enumerated entity list, so no XML edit was needed for
it. It may still need a re-publish after this pull if the two new entity sets
don't appear immediately in the service catalog.

**Deferred from the dashboard's Security Monitor panel** (not this commit):
"Certificates expiring ≤ 30 days" (`STRUST`, shared with the future Alerts
stage — `01_feasibility_map.md` §15/§19) and "Privileged / dormant admin
users" (`AGR_USERS`, Phase 2 per the map). Stage 2 ships the four fields with
the clearest single-table source: locked users, password-change date (raw,
no aging computation), technical/communication users (`UserType`), and
`ValidToDate`.

## 13. Pull & activate (Stage 2)

Same procedure as Stage 1 (§10), against the now-linked `ZABAP_UTIL` package.
Report every activation error back verbatim; log entries continue in
`BUILD_ISSUES_LOG.md` §1. If `USR02` field names differ on this system from
§1 of the log's table, that's the first real signal this table needs the same
per-field verification the PA-infotypes did.

Two items intentionally **not** in Stage 1's Data Quality slice, even though
they're in the dashboard's Section G:

- **Duplicate Employee** — needs an aggregation (`GROUP BY … HAVING`) on top of
  the anchor view. Employee-360's log shows aggregation was its single biggest
  source of activation errors (A3/A4/A15/A17/A28/A29). Shipping it once the
  four simple checks are proven green (Stage 10) follows the log's own rule:
  grow from a working core.
- **Missing Manager** — needs an `HRP1001` chief-position relationship whose
  exact ID Employee-360 itself never confirmed on this client
  (`BUILD_ISSUES_LOG.md` §E: *"HRP1001 chief-position path unverified... re-add
  when client confirms the relationship IDs"*). Same open item, not
  re-solved blind here.

"Invalid Position" in Stage 1 is delivered as **"Position not assigned"**
(`PositionId` initial) — the verified, low-risk proxy — rather than a
dummy-position-code check (e.g. `PLANS = 99999999`), since that convention is
client-specific and unconfirmed. Upgraded once confirmed.

## 9. What ships in this commit (Stage 1)

| Object | Type | Purpose |
|---|---|---|
| `ZI_TWR_EMP_BASIC` | Interface CDS | Anchor: one row per active employee — PA0001 ⋈ PA0002 |
| `ZI_TWR_EMP_CONTACT` | Interface CDS | Email address — PA0105 subtype 0010 |
| `ZI_TWR_EMP_BANK` | Interface CDS | Bank / IBAN — PA0009 subtype 0 |
| `ZI_TWR_DQ_ISSUE` | Interface CDS | 4-branch UNION check view (Missing Email / Cost Center / Position / Bank) |
| `ZC_TWR_DQ_ISSUE` | Consumption CDS | Query view + minimal `@UI` for a List Report |
| `ZC_TWR_DQ_SUMMARY` | Consumption CDS | Aggregated by Category/Severity, for the donut |
| `ZTWR_UI_SRVD` | Service Definition | Exposes both consumption views |
| `ZTWR_UI_SRVB_O4` | Service Binding | OData V4 – UI, published |

## 10. Pull & activate (Stage 1)

1. `ZABAP_UTIL` already exists (owned by `Utility-Class-and-Method`) — no
   package to create.
2. Link the `VS-Tower` repo to `ZABAP_UTIL` in the abapGit repo settings, pull.
3. Package → **Activate All Inactive ABAP Development Objects** (run twice if
   the first pass leaves cross-references inactive).
4. Preview: open `ZTWR_UI_SRVB_O4` → select `DataQualityIssue` or
   `DataQualitySummary` → **Preview**.
5. Report back **every** activation error verbatim (object + full message
   text) before the next stage is written — each gets logged in
   `BUILD_ISSUES_LOG.md` with its fix, per the process rule.

## 11. Post-pull (not in the repo)

- **SLG0** — not needed yet (no ABAP class/report in this stage).
- **Authorization** — none required by design (D2). The dashboard tile itself
  is restricted to HR-and-above by Basis, outside this repo's scope.

## 14. What ships in this commit (Stage 3)

| Object | Type | Purpose |
|---|---|---|
| `ZI_TWR_BGJOB` | Interface CDS | Anchor: one row per `TBTCO` job step. `Status` cast to plain `abap.char(1)` proactively (T1 precedent) |
| `ZC_TWR_BGJOB` | Consumption CDS | List view — job name/count, status with criticality, start/end date+time |
| `ZC_TWR_BGJOB_SUMMARY` | Consumption CDS | Aggregated by `Status`, for the donut |
| `ZTWR_UI_SRVD` (extended) | Service Definition | Now exposes `BackgroundJob` and `BackgroundJobSummary` too |

No date-range filter in the CDS (avoids date-arithmetic risk per the "grow
from a working core" rule) — filtering is interactive, via
`@UI.selectionField` on `JobName` / `Status` / `StartDate`, the same pattern
proven twice already. `StatusCriticality`: `F` (finished) → positive,
`A` (aborted/cancelled) → negative, everything else → neutral. Duration is
not computed (time arithmetic across midnight is exactly the kind of thing
Employee-360's log warns about) — raw start/end date+time only, for now.

**Deferred from the dashboard's Background Jobs panel** (not this commit):
watched-jobs catalog, missed-schedule detection, drill to job log, re-run
action — all Stage 4+/Phase 2 per the roadmap.

## 15. Pull & activate (Stage 3)

Same procedure as Stage 2 (§13). Preview `BackgroundJob` or
`BackgroundJobSummary` on `ZTWR_UI_SRVB_O4`; re-publish the binding if the new
entities don't appear immediately. Report every result — clean or not —
verbatim for the log.

## 16. What ships in this commit (Stage 4 — reordered, see box above)

| Object | Type | Purpose |
|---|---|---|
| `ZI_TWR_TRANSPORT` | Interface CDS | Anchor: one row per `E070` transport request header, local system only |
| `ZC_TWR_TRANSPORT` | Consumption CDS | List view — request, type, status with criticality, owner, changed-on date/time |
| `ZC_TWR_TRANSPORT_SUMMARY` | Consumption CDS | Aggregated by `RequestStatus`, for the donut |
| `ZTWR_UI_SRVD` (extended) | Service Definition | Now exposes `TransportRequestSet` and `TransportSummary` too |

No `E07T` join (short text) — deliberately deferred, see §20 (Q) and the
Employee-360 A10 precedent. `StatusCriticality` only claims `D`/`R`; other
status codes render neutral rather than guessed.

## 17. Pull & activate (Stage 4)

Same procedure as Stage 3 (§15). Preview `TransportRequestSet` or
`TransportSummary`.

## 18. What ships in this commit (Stage 5 — reordered, see box above)

| Object | Type | Purpose |
|---|---|---|
| `ZC_TWR_HEADCOUNT` | Consumption CDS | Aggregates `ZI_TWR_EMP_BASIC` (Stage 1) by `CompanyCode` × `PersonnelArea`, for the donut/KPI. **No new interface view.** |
| `ZTWR_UI_SRVD` (extended) | Service Definition | Now exposes `HeadcountOverview` too |

Grouped by `CompanyCode` × `PersonnelArea` only, **not region** — the
org-unit-to-region mapping needed for that hasn't been confirmed with the
client, so it isn't guessed here (upgraded once confirmed, alongside the org
hierarchy/tree in a later Phase-2 stage).

## 19. Pull & activate (Stage 5)

Same procedure. Preview `HeadcountOverview`. **Result: clean, confirmed by
the client alongside Stages 3–4 — see `BUILD_ISSUES_LOG.md`.**

## 20. What ships in this commit (Stage 6 — Foundation, narrowed)

The original Stage 4 plan (§8) had four config/snapshot tables. This commit
ships **one** — the interface catalog — narrowed for two reasons: it's the
first use of the `TABL` object type in this repo (see the "why reordered" box
in §8 for the risk), and the other three (watched-jobs catalog, alert config,
snapshot history) have no consumer yet (Stage 3's Background Jobs Monitor
already lists every job without a catalog; Alerts and Trends, the stages that
would need them, aren't built yet).

| Object | Type | Purpose |
|---|---|---|
| `ZTWR_CFG_IFACE` | Table | Interface catalog — id, name, log technique, log object (message type / service name / AIF interface), expected frequency, owner, active flag. Ships **empty**. |
| `ZI_TWR_CFG_IFACE` | Interface CDS | Anchor, plain `select from` |
| `ZC_TWR_CFG_IFACE` | Consumption CDS | List view for maintenance visibility |
| `ZTWR_UI_SRVD` (extended) | Service Definition | Now exposes `InterfaceCatalog` too |

Every field name is this repo's own choice (new table, not an existing SAP
one), so there's no field-name-guessing risk the way reading `PA0001` or
`USR02` blind would carry — the only new risk is the `TABL` XML schema itself,
mitigated by mirroring `Utility-Class-and-Method`'s one proven `TABL` object
(`ZAB_V1_UT_ADPT`) field-for-field in shape, reusing its exact `XFELD` data
element for the active flag and the already-proven `BNAME` for the owner.

**How to populate it**, once you have the data (see §22 / the data-collection
doc): `SE16N` → table `ZTWR_CFG_IFACE` → create entries directly (needs a
developer key / `S_TABU_DIS` authorization for direct table maintenance), or
ask Basis to generate a proper maintenance dialog: `SE11` → open the table →
**Utilities → Table Maintenance Generator** → assign an authorization group
and function group → generates an `SM30`-style maintenance transaction. The
generator itself isn't something abapGit serializes cleanly (same class of
risk as the hand-written DDLX metadata extensions Employee-360 dropped at C2),
so it's a one-time manual step, not shipped in the repo.

## 21. Pull & activate (Stage 6)

1. Pull, then **Activate All Inactive ABAP Development Objects** (twice if
   needed) — this is the first `TABL` activation in this repo, so treat any
   error here as high-priority to report verbatim.
2. Preview `InterfaceCatalog` on `ZTWR_UI_SRVB_O4` — **0 rows is the correct,
   clean result** (the table ships empty). A runtime error is not.
3. Report back clean/error either way.

## 22. Stage 7 — blocked, needs data

Integration Monitoring can't be built without knowing which interfaces
actually exist and how each one logs. See the dedicated collection guide:
**[`03_stage7_data_collection.md`](03_stage7_data_collection.md)**.
