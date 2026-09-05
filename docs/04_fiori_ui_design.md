# VS-Tower — Fiori UI Design (Doc 04)

**Status:** Recommendation, ready for a Fiori developer to execute.
**Preview:** an illustrative mockup of this layout —
https://claude.ai/code/artifact/97cfe246-dc8d-425f-b8dc-d133ed09ab3f
(numbers on it are examples for layout review, not live data; the real app
will render in SAP Horizon, not this mockup's exact colors/fonts).

---

## 1. App type — Fiori Elements Overview Page, not freestyle

The original architecture (`02_solution_architecture.md` §4) called for a
**freestyle** SAPUI5 shell, because the dashboard's Workflow funnel and Org
Structure tree aren't standard Fiori Elements chart types. Neither of those
got built in this CDS round (funnel = Phase 2/pending a decision below; org
tree = deliberately deferred, `00_context_and_decisions.md` §7). Every entity
that **is** built is either:

- an **analytical card** shape (a `GROUP BY` + `COUNT` view with a
  `@UI.chart` donut annotation already on it), or
- a **list card** shape (a plain list view with `@UI.lineItem`/
  `selectionField`/`identification` already on it, ready for a List
  Report/Object Page).

Both are exactly what a **Fiori Elements Overview Page (OVP)** app is built
from, out of the box, with no custom JavaScript. **Recommendation: build the
first version as an OVP app**, and only reach for freestyle cards later, if
and when Workflow's funnel or an Org tree actually gets built — don't build
freestyle infrastructure today for visuals that don't exist yet.

## 2. Card map — one row per OVP card

| Card | Type | Entity | Notes |
|---|---|---|---|
| Data Quality by Category | Analytical (donut) | `DataQualitySummary` | dimension `Category`, measure `IssueCount` |
| Recent Data Quality Issues | List | `DataQualityIssue` | sort by `SeverityCriticality` desc |
| User Lock Status | Analytical (donut) | `SecuritySummary` | dimension `IsLocked`, measure `UserCount` |
| Locked / At-Risk Users | List | `SecurityUser` | filter `IsLocked = 'X'` as the card's default selection variant |
| **Jobs Needing Attention** | List | `BackgroundJobHealth` | **primary card for this section** — already deduped/filtered server-side, no client filter needed |
| Job Health Split | Analytical (donut) | `BackgroundJobHealthSummary` | dimension `Status`, measure `JobNameCount` |
| Job Run History | List | `BackgroundJobHistory` | secondary/drill-down only — don't lead with this, it's the full unfiltered log |
| Transport by Status | Analytical (donut) | `TransportSummary` | dimension `RequestStatus`, measure `RequestCount` |
| Transport by Type | Analytical (donut) | `TransportTypeSummary` | dimension `RequestType`, measure `RequestCount` |
| Recent Transport Requests | List | `TransportRequestSet` | |
| Headcount by Area | Analytical (donut) | `HeadcountOverview` | dimensions `CompanyCode`/`PersonnelArea`, measure `EmployeeCount` |
| Headcount by Employee Group | Analytical (donut) | `HeadcountByGroup` | dimensions `EmployeeGroup`/`EmployeeSubgroup`, measure `EmployeeCount` |
| Payroll Areas | Analytical (donut) | `PayrollAreaOverview` | dimension `PayrollArea`, measure `EmployeeCount` |

## 3. Card groups (OVP sections)

1. **Data Quality**
2. **Security**
3. **Background Jobs** — put *Jobs Needing Attention* first; *Job Run
   History* last in the group, visually de-emphasized
4. **Transports**
5. **Workforce** — the three headcount/payroll cards

## 4. Alerts & Notifications — not a new entity, a composition

Per the CDS closure (`00_context_and_decisions.md` §7), Alerts doesn't get
its own backend object. Build it in the OVP/launchpad as a **KPI header
strip** or a **stat-tile row** at the top of the page, each tile a filtered
read of a card already above it:

| Tile | Source | Filter |
|---|---|---|
| Data quality issues | `DataQualitySummary` | total |
| Locked users | `SecuritySummary` | `IsLocked = 'X'` |
| Jobs needing attention | `BackgroundJobHealthSummary` | total (already pre-filtered) |
| Transport requests open | `TransportSummary` | `RequestStatus in ('D','R')` |

This is exactly what the preview mockup's top KPI row shows.

## 5. Navigation

Every list/analytical card's "See all" opens the entity's own **List
Report** → **Object Page**, generated from the same `@UI` annotations
already on each consumption CDS view — no extra annotation work needed
beyond what's already shipped. `DataQualityIssue`'s `EmployeeID`,
`SecurityUser`'s `Username`, `TransportRequestSet`'s `TransportRequest`, etc.
are all already keys with `@UI.selectionField` for the filter bar.

## 6. Launchpad tile

| Property | Value |
|---|---|
| Title | VS SF Control Tower |
| Subtitle | SuccessFactors Integration Monitoring |
| Icon | `sap-icon://home` or a control-tower-style custom icon, client's choice |
| Semantic object / action | e.g. `ZTwrControlTower-display` |
| Target | the OVP app, service `ZTWR_UI_SRVB_O4` |

## 7. What the Fiori developer does

1. In SAP Business Application Studio (or ADT's Fiori tools), generate a new
   **SAP Fiori Overview Page** application, pointed at OData service
   `ZTWR_UI_SRVB_O4`.
2. Add one card per row in §2's table, grouped per §3.
3. Configure the KPI header per §4.
4. Wire the launchpad tile per §6.
5. Theme: SAP Horizon (Quartz Light default) — no custom theming needed, the
   annotations already carry the semantic coloring (`criticality` on
   `Severity`/`Status`/`IsLocked` fields drives Fiori's own status colors
   automatically).

No manifest/annotation files are shipped in this repo yet — that's the
Fiori developer's own project, built against the already-published,
already-tested OData service. If UI-layer annotations (metadata extensions
for facets, custom chart qualifiers, etc.) turn out to be needed beyond what
inline `@UI` already provides, those come back into this repo as `.ddlx`
files once authored — see Employee-360's own note on that
(`BUILD_ISSUES_LOG.md` C2: author them in ADT/BAS against a live system,
not hand-written blind).

## 8. Workflow — data now available, funnel still not

`ZI_TWR_WORKITEM`/`ZC_TWR_WORKITEM`/`ZC_TWR_WORKITEM_SUMMARY` were built
after this doc was first written — a conservative first cut over `SWWWIHEAD`
alone (`00_context_and_decisions.md` §8, `02_solution_architecture.md` §30).
For the OVP card map:

| Card | Type | Entity | Notes |
|---|---|---|---|
| Work Items by Type × Status | Analytical (donut) | `WorkItemSummary` | dimensions `WorkItemType`/`Status` (raw codes — see below), measure `ItemCount` |
| Recent Work Items | List | `WorkItem` | no criticality yet — status-code meanings not confirmed |

**Not the funnel from the original mock-up.** `WorkItemType`/`Status` are
exposed as **raw codes**, not mapped to "Pending / In Manager Inbox /
Escalated / Overdue / Completed" — that mapping needs the real code meanings
(seen once this is previewed) and `SWWUSERWI` (manager-inbox assignment,
not built yet). Until then, present this as a generic "Workflow Items"
card, not as the funnel — a funnel chart isn't a standard Fiori Elements
type anyway, so it stays a freestyle-only visual regardless of when the
underlying data is ready.
