# VS-Tower — Stage 7 Data Collection (Doc 03)

**For:** SAP Basis / Integration team — confirmed as the default responsible
owner for this reconnaissance.
**Blocks:** Stage 7 (Integration Monitoring + Inbound Message Monitor —
`01_feasibility_map.md` §6/§7)
**Feeds:** `ZTWR_CFG_IFACE` (Stage 6, already pushed — see
`02_solution_architecture.md` §20)

---

## Why this is needed

The dashboard's Integration Monitoring panel shows, per interface: last run,
status, processed/failed/pending counts. Each of those numbers comes from a
**different table** depending on how that interface is technically built —
`EDIDC`/`EDIDS` for IDoc, `SRT_MONI` for a SOAP web service, `/AIF/*` for
Application Interface Framework. Writing that CDS blind — guessing which
table, and which service/message-type name to filter on — is exactly the kind
of fabricated specific this repo has avoided everywhere else (see
`00_context_and_decisions.md` §5 item 3, and every "verify in system" flag in
`01_feasibility_map.md`). This is the one piece of the build that's genuinely
**business information**, not something derivable from standard SAP tables.

## What's needed — one row per interface

| Field | What it means | Example |
|---|---|---|
| Interface name | What you'd want on the dashboard | Employee Replication |
| Log technique | `IDOC`, `SOAP`, `AIF`, or `PTP` | SOAP |
| Log object | The technical identifier that technique uses to log — see below | `EmployeeMasterDataReplicationRequest_In` |
| Expected frequency | How often it should run | Every 15 min |
| Owner | Who to contact if it's failing | Defaults to **SAP Basis Team** unless a specific interface has a named individual owner — no need to chase down a person per row. |

**"Log object" depends on the technique:**
- **IDoc** → the message type (e.g. `HRMD_A`, `HRMD_ABA`, or a custom `Z*` type)
- **SOAP** → the service name (as it appears in `SRT_MONI`)
- **AIF** → namespace + interface name (as it appears in `/AIF/ERR`)
- **PTP** → whatever identifier the point-to-point integration uses to log

The dashboard mock-up names eight candidate interfaces — use these as a
starting checklist, not a guarantee they all exist on this system:

Employee Replication · Position Replication · Cost Center Replication ·
Payroll Replication · Time Management · Leave Management · Benefits
Replication · Bank Details Replication

## How to get it — two paths

### Path A (fastest): check your own configuration records first

If this team (or a colleague) set up the SAP Cloud Integration content for
this landscape, the whole table above is often just a lookup in your own
integration/cutover documentation — usually faster than the self-service
steps below.

### Path B (self-service): find it in the system

**Step 1 — check the jobs Stage 3 already surfaced.** Open the
`BackgroundJob` preview (or run `SM37`) and filter the job name for `SF*`,
`ZSF*`, `Z_HR*`, or `*REPL*`. The job names you find are a strong hint at
what actually exists and roughly how often it runs (check the job's own
schedule/period in `SM37`).

**Step 2 — open each job's step to see what it calls.** In `SM37`, drill into
a job → **Step** → note the ABAP program name (or external command). A
program name containing `IDOC` usually means IDoc technique; a program
calling a generated proxy class (names often start with `CO_` or end in
`_PROXY`) usually means SOAP.

**Step 3 — check `SRT_MONI` directly.** Open transaction `SRT_MONI` with no
filter and look at the service/interface list — it shows every SOAP service
that has actually logged inbound messages recently. Note the exact service
names.

**Step 4 — check `WE20` (Partner Profiles) → Inbound parameters.** If any
message types related to HR exist (`HRMD_A`, `HRMD_ABA`, or a custom `Z`
type), that confirms IDoc technique and gives you the message type.

**Step 5 — check `/AIF/ERR`** (AIF Error Handling app) if you're not sure
whether AIF is used at all — it lists every configured AIF interface
directly, or is simply not installed/relevant if AIF isn't licensed here
(ties back to the open question in `00_context_and_decisions.md` §5).

## Once you have it

Fill in a copy of the table above (as many rows as real interfaces exist —
could be fewer or more than eight) and send it back here. I'll turn it
directly into the CDS design for Stage 7 — no further back-and-forth needed
on the data itself.

If you'd rather enter it directly into the system yourself first: `SE16N` →
table `ZTWR_CFG_IFACE` → create entries (needs a developer key /
`S_TABU_DIS` for direct table maintenance), or ask Basis to generate a proper
maintenance dialog first (`02_solution_architecture.md` §20). Either way,
paste the same table here too, so it's on record in this repo alongside every
other decision.
