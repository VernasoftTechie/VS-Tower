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
// T2 (BUILD_ISSUES_LOG.md): a plain cast(x as abap.dats) on a genuinely
// blank/initial date (STRTDATE = 00000000 - normal for a scheduled-but-not-
// yet-run job step) still activates fine, but breaks the Fiori runtime with
// "Property 'StartDate' has invalid value ''" - specifically on a date field
// marked @UI.selectionField, where Fiori Elements builds a value-help /
// visual-filter that can't parse the blank value. Fix: map initial dates/
// times to an explicit typed NULL instead of the DATS/TIMS zero-value, so
// OData serializes them as "no value" rather than an empty string. Applied
// to all four date/time fields here, not just StartDate (same table, same
// risk - EndDate/StartTime/EndTime are just as often blank for a job that
// hasn't finished/started).

define view entity ZI_TWR_BGJOB
  as select from tbtco
{
  key jobname                                                            as JobName,
  key jobcount                                                           as JobCount,
      cast( status as abap.char( 1 ) )                                   as Status,
      cast( case when status = 'F' then 3
                  when status = 'A' then 1
                  else 2 end as abap.int4 )                               as StatusCriticality,
      case when strtdate is initial then cast( null as abap.dats )
           else cast( strtdate as abap.dats ) end                        as StartDate,
      case when strttime is initial then cast( null as abap.tims )
           else cast( strttime as abap.tims ) end                        as StartTime,
      case when enddate is initial then cast( null as abap.dats )
           else cast( enddate as abap.dats ) end                         as EndDate,
      case when endtime is initial then cast( null as abap.tims )
           else cast( endtime as abap.tims ) end                         as EndTime
}
