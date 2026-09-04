@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Transport Request (anchor)'
@Metadata.ignorePropagatedAnnotations: true

// One row per transport request header. Local system only - no TMS RFC to
// the domain controller (deferred, needs confirmation it's permitted -
// 00_context_and_decisions.md §5 item 4). Deliberately NOT joined to E07T
// (short text) - text-table joins were Employee-360's single biggest source
// of "column unknown" errors (A10); E070 header fields alone are enough for
// this first cut. RequestType/RequestStatus cast defensively from the start
// (T1 precedent). StatusCriticality only claims the two codes actually
// confirmed elsewhere (D=modifiable, R=released) - any other code falls to
// neutral rather than guessing its meaning.

define view entity ZI_TWR_TRANSPORT
  as select from e070
{
  key trkorr                                                          as TransportRequest,
      cast( trfunction as abap.char( 1 ) )                            as RequestType,
      cast( trstatus as abap.char( 1 ) )                              as RequestStatus,
      cast( case when trstatus = 'R' then 3
                  when trstatus = 'D' then 2
                  else 2 end as abap.int4 )                            as StatusCriticality,
      as4user                                                         as Owner,
      cast( as4date as abap.dats )                                    as ChangedOnDate,
      cast( as4time as abap.tims )                                    as ChangedOnTime
}
