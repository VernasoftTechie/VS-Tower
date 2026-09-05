@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Background Job (anchor)'
@Metadata.ignorePropagatedAnnotations: true

// One row per background job step (TBTCO primary key = JOBNAME + JOBCOUNT).
// STATUS is cast defensively from the start (T1, BUILD_ISSUES_LOG.md): this
// system enforces the conversion-exit rule on code fields generally, not
// just dates, so the same fix that USR02-USTYP needed is applied here
// pre-emptively rather than waiting for the same round-trip. No date-range
// filter here (kept simple, per "grow from a working core") - interactive
// filtering is via @UI.selectionField in the consumption view, same pattern
// already proven in Stage 1/2.
//
// T2 (BUILD_ISSUES_LOG.md) - two failed attempts before this one:
//   1. cast(x as abap.dats) + StartDate as @UI.selectionField -> Fiori
//      runtime: "Property 'StartDate' has invalid value ''" on a genuinely
//      blank STRTDATE (normal for a scheduled-but-not-yet-run job step).
//   2. Removing @UI.selectionField (keeping abap.dats) -> SAME runtime
//      error persists. Disproves the "value-help" theory - the break is not
//      about filterability, it's that this system's OData V4 / Edm.Date
//      serialization cannot handle a blank/initial DATS in a row list at
//      all, filterable or not.
//   (A third attempt, mapping blank to cast(null as abap.dats), doesn't even
//   activate - "Unexpected keyword NULL" - CDS view entities don't accept a
//   bare NULL literal inside cast().)
// Actual fix: stop using Edm.Date/Edm.TimeOfDay for these four fields.
// Expose them as plain text (abap.char) instead - Edm.String has no
// "must be a valid date" parsing constraint, so a blank value is just an
// empty string, not an error. Blank-safe via an explicit empty-literal cast
// (a normal, already-proven-safe literal cast - not the null-cast that
// failed above). Formatting (e.g. "2026-09-04") is a later polish item, not
// needed to get this table working.
//
// Owner (2026-09-05): TBTCO-SDLUNAME - the user who scheduled the job.
// Added for the "who does the team lead contact" requirement - a manager
// looking at a pending/aborted job needs a name, not just a job name.
// Selected raw, uncast, same as E070-AS4USER -> ZI_TWR_TRANSPORT.Owner
// (already confirmed clean) - same field class (a BNAME-style username),
// same confidence.

define view entity ZI_TWR_BGJOB
  as select from tbtco
{
  key jobname                                                            as JobName,
  key jobcount                                                           as JobCount,
      cast( status as abap.char( 1 ) )                                   as Status,
      cast( case when status = 'F' then 3
                  when status = 'A' then 1
                  else 2 end as abap.int4 )                               as StatusCriticality,
      sdluname                                                           as Owner,
      case when strtdate is initial then cast( '' as abap.char( 8 ) )
           else cast( strtdate as abap.char( 8 ) ) end                    as StartDate,
      case when strttime is initial then cast( '' as abap.char( 6 ) )
           else cast( strttime as abap.char( 6 ) ) end                    as StartTime,
      case when enddate is initial then cast( '' as abap.char( 8 ) )
           else cast( enddate as abap.char( 8 ) ) end                     as EndDate,
      case when endtime is initial then cast( '' as abap.char( 6 ) )
           else cast( endtime as abap.char( 6 ) ) end                     as EndTime
}
