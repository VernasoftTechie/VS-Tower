@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Stale Custom Object (anchor)'
@Metadata.ignorePropagatedAnnotations: true

// Custom repository objects still locked in an unreleased transport that has
// not moved in 6+ months - the "abandoned dev work, is this still needed?"
// cleanup worklist (client ask 2026-09-08, replaces the failed-auth idea).
//
// E071 (object list per request) inner-joined to its E070 header for the
// date / owner / status, and to TADIR for package + author. Only R3TR (real
// transportable objects) named Z* / Y*, only modifiable requests (TRSTATUS
// D or L), only where the request's last-change date (AS4DATE) is 6+ months
// old (DATS_DAYS_BETWEEN). Every field name here is either already proven
// (E070, via ZI_TWR_TRANSPORT) or client-confirmed in SE11 (E071 OBJ_NAME
// etc., TADIR AUTHOR / DEVCLASS / KORRNUM).
//
// Namespaced objects (/xyz/...) are not caught by this first cut. AS4DATE is
// "last changed" for the request, so a 2-year-old request that had an object
// added last week reads as recent - accepted (it's still being worked on).
// All joins are 1:1 on the joined table's key, so COUNT(*) downstream cannot
// multiply rows (rule #4).

define view entity ZI_TWR_STALE_OBJ
  as select from e071 as o
    inner join e070 as h
      on h.trkorr = o.trkorr
    inner join tadir as t
      on  t.pgmid    = o.pgmid
      and t.object   = o.object
      and t.obj_name = o.obj_name
{
  key o.trkorr                             as TransportRequest,
  key o.as4pos                             as Position,
      o.object                             as ObjectType,
      o.obj_name                           as ObjectName,
      t.devclass                           as Package,
      t.author                             as Author,
      h.as4user                            as TransportOwner,
      cast( h.trstatus as abap.char( 1 ) ) as RequestStatus,
      cast( h.as4date as abap.char( 8 ) )  as ChangedOn
}
where o.pgmid = 'R3TR'
  and ( h.trstatus = 'D' or h.trstatus = 'L' )
  and ( o.obj_name like 'Z%' or o.obj_name like 'Y%' )
  and dats_days_between( h.as4date, $session.system_date ) >= 180
