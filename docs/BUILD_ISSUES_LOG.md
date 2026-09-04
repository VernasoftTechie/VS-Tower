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
8. **Never expose a raw PA-infotype date** (`BEGDA/ENDDA/GBDAT/…`) to OData —
   the `PDATE` conversion exit breaks the Fiori runtime. Always
   `cast( x as abap.dats )`. Times → `cast( x as abap.tims )`.
9. CURR/QUAN fields (amounts, quantities) need `cast( … as abap.dec(n,2) )` —
   plain decimal, no reference-field ceremony, unless the semantic annotation
   is deliberately wanted.
10. **Don't invent HR text-table field names.** Expose raw codes from the
    infotype tables only. Every field name in this repo's CDS must be one we
    have actually verified (see §1 table below) — don't guess.
11. CDS reserved word: `POSITION` (renamed `PositionId` on Employee-360; same
    rule applies here). Also avoid `CLIENT KEY USER LANGUAGE DATE TIME VALUE
    LEVEL NAME TYPE` as element names when in doubt.
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

### §1 — Field names verified on this system (safe to reuse)

Carried over from Employee-360's own hard-won verification. Anything **not**
in this table is unverified on this system — check SE11 before using it.

| Table | Fields confirmed to exist here |
|---|---|
| `PA0001` | `PERNR BUKRS WERKS BTRTL PERSG PERSK ORGEH KOSTL PLANS STELL BEGDA ENDDA` (no `STAT2/STAT1/STAT3` on this system — A11) |
| `PA0002` | `PERNR NACHN VORNA GBDAT GESCH NATIO BEGDA ENDDA` |
| `PA0105` | `PERNR SUBTY USRID_LONG BEGDA ENDDA` (subtype `0010` = email, `0020` = mobile) |
| `PA0009` | `PERNR SUBTY BANKL BANKN BKONT IBAN BEGDA ENDDA` (subtype `0` = main bank) |
| `PA0006` | `PERNR SUBTY STRAS ORT01 PSTLZ LAND1 BEGDA ENDDA` (subtype `1` = permanent residence) |
| `USR02` | `BNAME USTYP CLASS UFLAG ERDAT TRDAT GLTGV GLTGB` — **not yet pulled/activated on this system** (Stage 2). Unlike the PA-infotype table, `USR02` is a kernel-level user-master table stable across every SAP release, so confidence is high, but it still gets the same treatment: report the first Stage 2 activation result here, verified or not. |

---

## 1. Issues encountered in this repo

| # | Symptom | Root cause | Fix | Commit |
|---|---|---|---|---|
| — | — | — | — | — |

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
