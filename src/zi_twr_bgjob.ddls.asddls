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
// yet-run job step) breaks the Fiori runtime with "Property 'StartDate' has
// invalid value ''" - but ONLY because StartDate was @UI.selectionField
// (Fiori Elements builds a value-help/visual-filter over it that can't parse
// the blank value). First attempted fix - mapping initial to an explicit
// cast(null as abap.dats) - does NOT activate on this system/release:
// "Unexpected keyword NULL". ABAP CDS view entities don't take a bare NULL
// literal inside cast() the way plain SQL does. Reverted to plain casts here
// (proven, activates clean); the actual fix is at the UI-annotation layer -
// see ZC_TWR_BGJOB, which no longer marks StartDate as a selectionField.
// Stage 2's blank ValidToDate and Stage 4's blank ChangedOnDate both proved
// a blank date renders fine as long as it isn't filterable.

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
