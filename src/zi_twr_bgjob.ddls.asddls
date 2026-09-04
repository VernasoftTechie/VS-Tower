@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Background Job (anchor)'
@Metadata.ignorePropagatedAnnotations: true

// One row per background job step (TBTCO primary key = JOBNAME + JOBCOUNT).
// STATUS is cast defensively from the start (T1, BUILD_ISSUES_LOG.md): this
// system enforces the conversion-exit rule on code fields generally, not
// just dates, so the same fix that USR02-USTYP needed is applied here
// pre-emptively rather than waiting for the same round-trip. All dates/times
// cast per rule #8. No date-range filter here (kept simple, per "grow from
// a working core") - interactive filtering is via @UI.selectionField in the
// consumption view, same pattern already proven in Stage 1/2.

define view entity ZI_TWR_BGJOB
  as select from tbtco
{
  key jobname                                                            as JobName,
  key jobcount                                                           as JobCount,
      cast( status as abap.char( 1 ) )                                   as Status,
      cast( case when status = 'F' then 3
                  when status = 'A' then 1
                  else 2 end as abap.int4 )                               as StatusCriticality,
      cast( strtdate as abap.dats )                                      as StartDate,
      cast( strttime as abap.tims )                                      as StartTime,
      cast( enddate as abap.dats )                                       as EndDate,
      cast( endtime as abap.tims )                                       as EndTime
}
