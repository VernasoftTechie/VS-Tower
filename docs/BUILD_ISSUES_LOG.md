# VS-Tower — Build & Activation Issues Log

Running log of every error hit while activating this repo on the SAP system,
with the root cause and the fix. **Read section 0 before writing any CDS.
Check this whole file before every commit** — most activation errors on this
system are repeats of a mistake already made (and fixed) on Employee-360.

**Legend:** 🔴 blocked activation · 🟡 warning · ✅ fixed in the commit noted.

---

## 0. Pre-flight checklist — carried over from Employee-360 (same S/4 system)

These are not VS-Tower's own history yet — they are proven facts about *this*
system, inherited from `Employee-360/docs/BUILD_ISSUES_LOG.md`. Apply them
before the first activation, not after.

1. In a CDS **view entity**, `WHERE` goes **after** the `{ … }` element list.
2. No `IN ( … )` inside a JOIN `ON` condition — only in `WHERE`.
3. `/` division needs decimal operands — use `division( dividend, divisor, decimals )`.
4. `COUNT` on a column that can multiply via a `LEFT JOIN` needs `count( distinct col )`.
5. `UNION` — every branch needs the **same `key` markers** on the same elements,
   and every computed element needs an explicit `as <name>`, matching branch 1.
6. Never `cast` an integer literal to `NUMC` — cast a char literal instead
   (`cast( '00000000' as abap.numc(8) )`, not `cast( 0 as … )`).
7. `@EndUserText.label` and other VDM annotations ≤ **40 characters**.
8. **Never expose a raw field whose data element carries a conversion exit**
   to OData — the Fiori runtime fails hard (blank "Application could not be
   started" screen, not a partial render) with a message naming the exit.
   Known so far on this system: PA-infotype dates (`BEGDA/ENDDA/GBDAT/…` →
   `PDATE`, cast to `abap.dats`; times → `abap.tims`) **and** `USR02-USTYP`
   (→ `cast( x as abap.char( n ) )`, T1). Not just dates — any code field can
   carry one. When this exact error appears, cast the named field to a plain
   type in the **interface** view; don't guess which other fields need it
   pre-emptively, but do re-check every sibling code field on the same table
   after the fix (`USR02-CLASS` is next in line to watch, unconfirmed either
   way).
9. CURR/QUAN fields (amounts, quantities) need `cast( … as abap.dec(n,2) )` —
   plain decimal, no reference-field ceremony, unless the semantic annotation
   is deliberately wanted.
10. **Don't invent HR text-table field names.** Expose raw codes from the
    infotype tables only. Every field name in this repo's CDS must be one we
    have actually verified (see §1 table below) — don't guess.
11. CDS reserved word: `POSITION` (renamed `PositionId` on Employee-360; same
    rule applies here). Also avoid `CLIENT KEY USER LANGUAGE DATE TIME VALUE
    LEVEL NAME TYPE` as element names when in doubt.
    *Recurred 2026-09-08, three times on the stale-obj views:* `as4pos as
    Position` → `ItemPos` (5376ce6); `t.devclass as Package` → `DevClass`;
    `t.author as Author` → `ObjectAuthor` (pre-emptive, AUTHOR not confirmed
    reserved but not worth a 4th failed pull). **`PACKAGE` and `POSITION` are
    both hard-reserved.** Rule going forward: **prefix every element name** on
    a raw-table interface view (`Transport*`, `Object*`, `Dump*`) so a bare
    keyword collision is impossible.
12. **No RAP behavior definition in this repo.** VS-Tower is read-only by
    decision (D1) — every `ZC_TWR_*` view is a **plain `select from`** query
    view, never `as projection on`, never a BDEF/behavior pool. This sidesteps
    the entire class of Employee-360 issues A18/A19/B1–B5 (composition,
    `redirected to`, strict-mode lock flags) by construction.
13. `@Analytics.query` views have **no key fields** — an OData V4 UI service
    binding needs a key on every entity. Aggregating tiles are **plain view
    entities** with `key` on every grouping dimension + `GROUP BY`, not
    `@Analytics.query`.
14. A `CASE … END` expression cannot be a `key` element or a bare `GROUP BY`
    term. Compute it once in the flat interface view; the aggregating view
    groups by the resulting plain field.
15. Keep `@UI` to the basics — `headerInfo` / `lineItem` / `selectionField` /
    `identification` / `facet` + `criticality`. Add datapoints, presentation
    variants, or micro-charts one at a time against the live system, not blind.
16. **abapGit `.xml` metadata files need a UTF-8 BOM** (`EF BB BF`); **source
    files (`.asddls`, `.abap`, `.srvdsrv`) must NOT have one.** Every `.xml` in
    this repo is written with the BOM already applied.
17. **No authorization anywhere in this repo** (decision D2) —
    `@AccessControl.authorizationCheck: #NOT_REQUIRED` on every CDS entity, no
    DCL objects at all. This is a deliberate deviation from Employee-360 (which
    has `#CHECK` + `P_ORGIN` DCL on its anchor entity) and is *why* VS-Tower
    should not hit Employee-360's own unresolved item A26 ("List Report renders
    with no rows" — suspected DCL/authorization blocking the previewing user).
18. **Never reference an Employee-360 entity that carries `#CHECK`** (i.e.
    `ZI_HR360_EMP_BASIC`, `ZI_HR360_EMPLOYEE`) from VS-Tower CDS — a DCL on a
    source entity is enforced even through a consuming view with
    `#NOT_REQUIRED` of its own, which would silently reintroduce the
    authorization dependency decision D2 rules out. VS-Tower keeps its own
    small, self-contained interface views instead (duplicated field lists,
    zero cross-repo object dependency) — see `02_solution_architecture.md` §3.
19. **Grow from a working core.** One or two new entities per commit,
    re-activate ("Activate All Inactive ABAP Development Objects" on the
    package, twice), before adding the next. Don't ship a large batch of
    unactivated objects in one pull.
20. **A `Date`/`Time` field with a genuinely blank/initial value can break the
    Fiori runtime when exposed as `Edm.Date`/`Edm.TimeOfDay`** —
    "Property '&lt;X&gt;' has invalid value ''" (T2). This is **not** specific
    to `@UI.selectionField` — removing it did not fix T2 (only the first,
    wrong, diagnosis thought so). The safe fix: expose a date/time field as
    plain **text** (`abap.char(8)`/`abap.char(6)`) instead of
    `abap.dats`/`abap.tims` when blank values are normal for that field —
    `Edm.String` has no "must be a valid date" constraint, so a blank value
    is just an empty string, not an error:
    `case when x is initial then cast( '' as abap.char(n) ) else cast( x as abap.char(n) ) end`
    (the empty-string cast is a normal literal cast, proven safe throughout
    this repo — unlike `cast( null as … )`, which **doesn't activate** on
    this system: "Unexpected keyword NULL", ABAP CDS view entities don't
    accept a bare `NULL` literal inside `cast()` the way plain SQL does).
    Only use `abap.dats`/`abap.tims` for a date/time field that is **never**
    blank in practice (e.g. `PA0002-GBDAT`, always populated).
21. **A CDS element selected straight from a table field inherits that
    field's underlying DATA ELEMENT label** if the CDS element carries no
    `@EndUserText.label` of its own — regardless of
    `@Metadata.ignorePropagatedAnnotations` (T3, `ZTWR_CFG_IFACE`). That
    inherited label is not reliably predictable: `CHAR20`/`CHAR40` render
    literally as "Char20"/"Char", and reusing a rollname assumed to be
    "the obvious SAP one" is risky — `BNAME`, reused from `USR02-BNAME`
    (proven safe as a raw **select source** in Stage 2), resolved to
    "Branching name" when used as a **rollname on a new custom table**,
    an entirely different and wrong label. Selecting a field raw is not the
    same guarantee as reusing its rollname elsewhere. Rule: **every element
    of a custom-table interface view gets its own explicit
    `@EndUserText.label`** — never rely on an inherited data-element label,
    known-good elsewhere or not.
22. **OData V4 names an exposed entity's TYPE as `<EntitySet>Type`** — if any
    property is named exactly that, the runtime fails hard: "Property
    '&lt;X&gt;' has the same EDM name as entity type '&lt;X&gt;'" (T4,
    `WorkItemSet`/`WorkItemType`; Employee-360's own A27 hit the identical
    pattern with `Education`/`EducationType`). This was already known — flag
    every new `expose … as <Name>;` line against every property name in that
    same consumption view **before** the first pull, not after. Fix: rename
    the **exposed set**, not the property (`TransportRequestSet`,
    `WorkItemSet` — append `Set`/`List`/similar whenever the natural set name
    collides with a property already on the view).
23. **A view that `select`s straight from a database table** (not from
    another CDS entity) **must declare `@Metadata.ignorePropagatedAnnotations:
    true`** — "Annotation Metadata.ignorePropagatedAnnotations is required"
    otherwise (T6). This is the interface-view marker. Keep the ZI/ZC split
    even for trivial lookups: `ZI_` does the raw `select` /
    `ignorePropagatedAnnotations`, `ZC_` is the plain projection for OData
    exposure / `allowExtensions` + `@UI`. Don't try to make one view do both.
24. **`SWWUSERWI` has no status column.** It is the user↔work-item inbox
    mapping only (`USER_ID`, `WI_ID`, plus some denormalised header copies —
    but *not* `WI_STAT`, T5). Join to `SWWWIHEAD` (or `ZI_TWR_WORKITEM`) for
    the status.
25. **The ONE ABAP class** (decision D1 relaxed 2026-09-08). `SNAP` (ABAP
    short dumps) is a clustered runtime-error store — no Open SQL / SE16N /
    CDS view can read it ("You cannot display SNAP with the standard tools"
    is the *expected* message). The "System Stability" card is therefore a
    RAP **custom entity** `ZC_TWR_SHORTDUMP` + query class
    `ZCL_TWR_SHORTDUMP_QRY` (`IF_RAP_QUERY_PROVIDER`). Rules for this one
    exception: read-only, no `MODIFY`/`UPDATE`/`INSERT` anywhere; the whole
    `SELECT FROM snap` is wrapped in `TRY … CATCH cx_root` so a reader failure
    (incl. missing table authorisation) yields an **empty card, never a 500**;
    the class does its own paging off `io_request->get_paging( )`. Activation
    order: custom entity first (annotation-only, activates with a warning
    while the class is missing) → class → re-activate the entity. The
    `.ddls.xml` for a custom entity uses `<SOURCE_TYPE>C</SOURCE_TYPE>`
    (unverified — if abapGit import rejects it, drop the element and let the
    system default). Runtime-error name / short text / program need the ST22
    decompress API and are a deliberate follow-up — v1 classifies on the
    SNAP header fields alone (retained flag, per-user dump count, recency).
26. **Element annotations go *before* the `key` keyword, never between `key`
    and the name.** `key @EndUserText.label: 'x' Field` → "Unexpected word @"
    (custom entity `ZC_TWR_SHORTDUMP`, 2026-09-08). Correct order:
    `@EndUserText.label: 'x'` newline `key Field : type;`. Also: the freestyle
    UI never reads CDS `@UI`, so a custom entity here carries `@EndUserText.label`
    only — no element `@UI`/`@ObjectModel` to widen the parser surface.
27. **A CDS built-in scalar function (`dats_days_between`, …) in a `WHERE`
    clause is release-dependent** (added ~7.55). Safe pattern: compute it in
    the **SELECT list** of the interface view as a plain field, then filter
    that field (`where AgeInDays >= 180`) in every consumption view — a plain
    integer comparison, no version risk. `ZI_TWR_STALE_OBJ` does this;
    `ZC_TWR_STALE_OBJ` / `_BY_OWNER` / `_BY_TYPE` each carry the filter.

### §1 — Field names verified on this system (safe to reuse)

Carried over from Employee-360's own hard-won verification. Anything **not**
in this table is unverified on this system — check SE11 before using it.

| Table | Fields confirmed to exist here |
|---|---|
| `PA0001` | `PERNR BUKRS WERKS BTRTL PERSG PERSK ORGEH KOSTL PLANS STELL BEGDA ENDDA` (no `STAT2/STAT1/STAT3` on this system — A11) |
| `PA0002` | `PERNR NACHN VORNA GBDAT GESCH NATIO BEGDA ENDDA` |
| `PA0105` | `PERNR SUBTY USRID_LONG BEGDA ENDDA` (subtype `0010` = email, `0020` = mobile) — *DQ retired 2026-09-08; `ZI_TWR_EMP_CONTACT` removed, kept here as verified fact* |
| `PA0009` | `PERNR SUBTY BANKL BANKN BKONT IBAN BEGDA ENDDA` (subtype `0` = main bank) — *DQ retired 2026-09-08; `ZI_TWR_EMP_BANK` removed, kept here as verified fact* |
| `PA0006` | `PERNR SUBTY STRAS ORT01 PSTLZ LAND1 BEGDA ENDDA` (subtype `1` = permanent residence) |
| `USR02` | `BNAME USTYP CLASS UFLAG ERDAT TRDAT GLTGV GLTGB` — field **names** all activated fine (T1 was a runtime rendering error, not an activation error). `USTYP` needs `cast( … as abap.char(1) )` before it reaches OData (T1). `CLASS` confirmed clean (renders, no conversion-exit error). |
| `TBTCO` | `JOBNAME JOBCOUNT STATUS STRTDATE STRTTIME ENDDATE ENDTIME` — field **names** all confirmed clean. Proactive `STATUS` cast (applying T1 before it could recur) worked first try, no runtime error. `STRTDATE`/`STRTTIME`/`ENDDATE`/`ENDTIME` needed T2's fix (exposed as text, not `Edm.Date`/`Edm.TimeOfDay`) — that was a runtime-type issue, not a wrong field name. **`SDLUNAME` added 2026-09-05** (job-scheduler username, for the "who to contact" requirement) — same field class as `E070-AS4USER` (already confirmed clean, raw/uncast), high confidence, but **pending its own first activation** — not yet in the confirmed set until reported back. |
| `E070` | `TRKORR TRFUNCTION TRSTATUS AS4USER AS4DATE AS4TIME` — **confirmed clean.** No `E07T` join, no conversion-exit error. `AS4USER` (a username field, same family as `USR02-BNAME`) rendered fine raw, same as `BNAME` did in Stage 2. |
| `E071` / `TADIR` (2026-09-08, `ZI_TWR_STALE_OBJ`) | Client-confirmed in SE11: `E071` = `TRKORR AS4POS PGMID OBJECT OBJ_NAME`; `TADIR` = `PGMID OBJECT OBJ_NAME AUTHOR DEVCLASS KORRNUM` (+ a `CREATED_ON` date, not used). Ancient, ultra-stable CTS tables. **Pending first activation** — the one real unknown is whether `dats_days_between( … ) >= 180` is accepted in a CDS `WHERE`; if not, the 180-day filter moves to a consumption view / the UI. |
| `ZTWR_CFG_IFACE` | New custom table (Stage 6) — every field name is our own choice, so no SAP field-name guessing risk. Data elements used: `MANDT`, `CHAR20`, `CHAR40`, `BNAME` (reused from Stage 2, already proven to render raw), `XFELD` (reused from `Utility-Class-and-Method`'s `ZAB_V1_UT_ADPT`, the one proven `TABL` object in this toolchain). Activated clean, needed one labelling fix (T3) — **then retired and removed from the repo** (client direction, D9). Kept here as the historical record. |
| `SWWWIHEAD` | `WI_ID WI_TYPE WI_STAT` — **confirmed clean** (T4 was an EDM naming collision, not a field problem). **2026-09-07, client verified in SE11 before use:** `WI_TEXT` (description), `WI_CD` (creation date), `WI_AED` (last-change date), `WI_AAGENT` ("Actual Agent of Work Item"). Dates exposed as blank-safe **text** (the T2 fix) so date-range `$filter` is a YYYYMMDD string compare. `WI_AAGENT` format may be the 14-char prefixed org-object form (`US<username>`) rather than a bare name — the UI strips a leading `US`. **Pending first activation** of the extended `ZI_TWR_WORKITEM`. |
| `SWWUSERWI` | **2026-09-07, client verified in SE11:** `USER_ID` (inbox owner, bare username), `WI_ID` (work-item link), `WI_STAT` (denormalised status — no join to `SWWWIHEAD` needed for the pending-by-agent count). An item in several inboxes has several rows — intended ("consider all the users"). `'COMPLETED'`/`'CANCELLED'` used in `WHERE` are real `WI_STAT` values seen in the live data, not guesses. **Pending first activation** of `ZI_TWR_WF_AGENT` / `ZC_TWR_WF_BY_AGENT`. |
| `ZC_TWR_TRANSPORT_BY_OWNER` (2026-09-05) | No new table/fields — groups `ZI_TWR_TRANSPORT`'s already-confirmed `Owner`/`RequestStatus` (both clean since Stage 4), same 2-dimension `GROUP BY` shape already proven by `ZC_TWR_WORKITEM_SUMMARY`. Zero new field-name risk; **pending activation** like everything new in this round. |
| `SNAP` (2026-09-08, `ZCL_TWR_SHORTDUMP_QRY`) | Read in ABAP, not CDS (clustered table). Fields the query class reads: `DATUM UZEIT UNAME AHOST XHOLD` (dump date / time / user / app server / "retained in ST22" flag), filtered `DATUM >= today-7`. **All unverified** — this is the first read of `SNAP` on this system. If activation or runtime flags one, it is a straight rename in `build_list( )`; the `TRY … CATCH` means a wrong name degrades to an empty card, not a dump. `SNAP` being a genuine transparent table on this S/4 release (vs. a real cluster on old ECC) is itself the assumption to confirm. |
| `T001` / `T500P` / `T501T` / `T549T` (2026-09-07, `ZC_TWR_DIM_TEXT`) | Standard org/config text tables — **not** HR infotype text tables, so lower A10 risk. Fields used: `T001-BUKRS`/`BUTXT`, `T500P-PERSA`/`NAME1`, `T501T-PERSG`/`PTEXT`/`SPRSL`, `T549T-ABKRS`/`ATEXT`/`SPRSL`. Language-dependent branches filter `sprsl = $session.system_language`. **Pending first activation** — if `T500P-NAME1` is the wrong text field (the one I'm least sure of), that branch fails and gets fixed forward; the other three are near-certain. |

---

## 1. Issues encountered in this repo

| # | Symptom | Root cause | Fix | Commit |
|---|---|---|---|---|
| T1 | 🔴 **Fiori preview** (`SecurityUser`/`SecuritySummary`): blank screen — "Application could not be started due to technical issues. Do not use conversion ext USTYP here." | `USR02-USTYP`'s data element carries a conversion exit. Same failure class as Employee-360's A24 (`PDATE` on dates), but on a plain code field — the OData V4 / Fiori runtime can't render **any** field with a conversion exit, not just dates. | `cast( ustyp as abap.char( 1 ) ) as UserType` in `ZI_TWR_SEC_USER` — strips the data element, same technique as the date cast. Fixed once, in the interface view, so both consumption views (`ZC_TWR_SEC_USER`, `ZC_TWR_SEC_SUMMARY`) inherit the fix. | 09a7d7b — **confirmed clean**, client verified (4,860 users) |
| T2 | 🔴 **Fiori preview** (`BackgroundJob`): error dialog — "Parameter has invalid value: Parameter IV_VALUE has invalid value.", "Error occurred while processing property 'StartDate' of entity with index 1", "Property 'StartDate' has invalid value ''" | `TBTCO-STRTDATE` is genuinely blank (`00000000`) for a scheduled-but-not-yet-run job step — normal, common data. Exposed as `Edm.Date` (`abap.dats`), the runtime can't parse the resulting empty string for that row. **Not** specific to `@UI.selectionField` — removing it (attempt 2) did not fix it, proving the break is about the *type*, not filterability. | **Attempt 1 (wrong):** map initial → `cast( null as abap.dats )`. Does **not** activate — 🔴 "Unexpected keyword NULL"; CDS view entities don't accept a bare `NULL` inside `cast()`. **Attempt 2 (wrong):** drop `@UI.selectionField` from `StartDate`, keep `abap.dats`. Activates, but the **same runtime error persists** — disproves the value-help theory. **Actual fix:** `ZI_TWR_BGJOB` exposes `StartDate`/`StartTime`/`EndDate`/`EndTime` as plain text (`abap.char(8)`/`abap.char(6)`) instead of `abap.dats`/`abap.tims`, blank-safe via an empty-literal cast — `Edm.String` has no date-validity constraint, so a blank value is just an empty string, not an error. | 232e94a — **confirmed clean**, client verified end-to-end |
| T3 | 🟡 **Fiori preview** (`InterfaceCatalog`): filter bar and column headers show "Char20", "Char", "Branching name", "Checkbox" instead of business labels | `ZI_TWR_CFG_IFACE` selected the table's fields with no `@EndUserText.label` override, so Fiori fell back to each field's underlying data-element label. `IFACE_OWNER`'s rollname `BNAME` — reused from `USR02-BNAME`, proven safe as a raw **select source** in Stage 2 — resolved to **"Branching name"** as a rollname on this new table, not the expected username label. (0 rows itself is correct — the table ships empty — that part was never a bug.) | `ztwr_cfg_iface.tabl.xml`: `IFACE_OWNER` rollname changed `BNAME` → `CHAR40` (it holds free text like "SAP Basis Team", not a real username anyway). `ZI_TWR_CFG_IFACE`: every element now carries its own explicit `@EndUserText.label`, which wins regardless of the underlying data element. | 232e94a — confirmed clean; object itself **later retired entirely** (D9, `d1329d1`) so this fix is now moot, kept for the historical record |
| T4 | 🔴 **Fiori preview** (`WorkItemSet`/`WorkItemSummary`): blank screen — "Application could not be started due to technical issues. Property 'WorkItemType' has the same EDM name as entity type 'WorkItemType'." | Exact repeat of Employee-360's own A27: OData V4 names the entity **type** for an exposed set `<Name>` as `<Name>Type`. Set `WorkItem` → type `WorkItemType` → collides with the property literally named `WorkItemType` on the same view. Already a known rule (§0.22 existed in spirit before this) — just not checked against this specific new entity before the first pull. | `ztwr_ui_srvd.srvd.srvdsrv`: renamed the exposed set `WorkItem` → `WorkItemSet` (same fix already used for `TransportRequestSet`). No CDS change needed — property names stay as they are. | c7f26e0 — **confirmed clean**, client verified the whole ABAP/CDS layer end-to-end |
| T5 | 🔴 **Activation** (`ZI_TWR_WF_AGENT`): "The column WI_STAT is unknown" | `SWWUSERWI` has `USER_ID` and `WI_ID` but **no status column** — it's just the inbox mapping. The status lives on `SWWWIHEAD`. (Client had confirmed `WI_STAT` exists — on `SWWWIHEAD`, which is correct there.) | `ZI_TWR_WF_AGENT` now `select from swwuserwi inner join ZI_TWR_WORKITEM on WorkItemId = wi_id`, taking `Status` from the join — which also reuses `ZI_TWR_WORKITEM`'s defensive `WI_STAT` cast. `WI_ID` is `SWWWIHEAD`'s primary key so the join is 1:1, no row multiplication. | *(fix pushed, pending re-pull)* |
| T6 | 🔴 **Activation** (`ZC_TWR_DIM_TEXT`): "Annotation Metadata.ignorePropagatedAnnotations is required." | A view that `select`s straight from database tables (not from another CDS entity) must declare `@Metadata.ignorePropagatedAnnotations: true` — it's the interface-view marker. `ZC_TWR_DIM_TEXT` was a single view doing both jobs (UNION over `T001`/`T500P`/`T501T`/`T549T` **and** OData exposure) with the wrong metadata annotation (`allowExtensions`). | Split into the repo's standard ZI/ZC pair: **`ZI_TWR_DIM_TEXT`** (the UNION, `ignorePropagatedAnnotations`) + **`ZC_TWR_DIM_TEXT`** (plain projection for exposure, `allowExtensions` + `@UI`). New checklist item §0.23. | *(fix pushed, pending re-pull)* |

**Stage 2 result: confirmed after T1.** `SecurityUser` preview renders —
4,860 users, `UserType` showing `A` (cast fixed it), `IsLocked` criticality
icon correct, dates rendering (blank where genuinely unset, e.g. no
`ValidToDate` — not an error). `UserGroup` (`CLASS`) rendered blank for the
sample rows with **no runtime error**, so unlike `USTYP` it does **not**
carry a blocking conversion exit — real empty data, not a T1-style symptom.
No further action on `CLASS`.

**Duplicate Employee, Transport by Type, Headcount by Group result: clean,
all three.** Confirmed by the client. `ZI_TWR_EMP_DUP_KEY`'s self-join
(5th `ZI_TWR_DQ_ISSUE` branch), `ZC_TWR_TRANSPORT_TYPE_SUMMARY`, and
`ZC_TWR_HEADCOUNT_BY_GROUP` (on the extended `ZI_TWR_EMP_BASIC`) all
activated with zero errors. `PERSG`/`PERSK` confirmed to render fine with no
conversion-exit surprise (unlike `USTYP`/`TRSTATUS`'s siblings, which needed
casts) — added to the confirmed column of the field table below. CDS layer
closed for this round per client direction — see
`00_context_and_decisions.md` §7 for the full "what's not built and why."

**Stage 3 refinement result: clean.** `BackgroundJobHealth` (self-join +
`Status <> 'F'` filter) and `BackgroundJobHistory` (renamed, unchanged CDS)
both pulled, activated, and verified clean — no activation errors on the
self-join, the newest SQL construct in this repo. Confirmed working
end-to-end by the client. This is now the second proven "aggregate helper +
self-join" pattern (after the summary views), safe to reuse for the next
deferred item that needs the same shape (duplicate-employee detection).

**Stages 3–5 result: clean, all three.** Pulled and activated together after
the client's VPN issue cleared. `BackgroundJob`/`BackgroundJobSummary`,
`TransportRequestSet`/`TransportSummary`, `HeadcountOverview` all previewed
correctly, zero activation errors, no runtime/conversion-exit errors — the
proactive `Status` cast on `ZI_TWR_BGJOB` (applying T1 before it could recur)
paid off. Five stages in and the shape is holding: own anchor views,
`#NOT_REQUIRED` everywhere, no DCL, plain `select from`, defensive casts on
every code/date/time field.

**Stage 1 result: clean.** Pulled into `ZABAP_UTIL`, "Activate All Inactive"
succeeded first pass, `ZTWR_UI_SRVB_O4` → `DataQualityIssue` preview rendered
the filter bar (Personnel Number / Category selection fields), the criticality
icon on `Severity`, and real data — **40,529 issues** across the four Stage 1
checks. Zero activation errors. This is the strongest possible signal for
Stage 2: the whole chain (own anchor views, `#NOT_REQUIRED` throughout, no
DCL, plain `select from` consumption, published OData V4 binding) is proven
correct on this system — the §0 pre-flight checklist worked. Reuse the same
shape for every later stage rather than re-deriving it.

---

## 2. Process notes

1. Fix the first real error, re-activate, repeat — cascade errors downstream
   of one bad CDS view are noise.
2. **Always "Activate All Inactive" on the package**, run it twice, before
   reading the error list as final.
3. Report every activation error back verbatim (object + full message) — it
   gets logged here with the fix before the next file is written.
4. Before writing a new field reference into any CDS view, check §1 first.
   If the field isn't listed, verify it in SE11 on the target system before
   using it — don't guess (Employee-360 A10/A11).
