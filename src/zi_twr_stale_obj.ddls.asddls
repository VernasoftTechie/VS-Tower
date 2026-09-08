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
// D or L). The 6-months-old cut is NOT in this view's WHERE - DATS_DAYS_BETWEEN
// is exposed as AgeInDays in the field list (well-supported there) and every
// consumption view filters `AgeInDays >= 180`, so the function never sits in a
// WHERE clause (where its support is release-dependent). Every field name here
// is either already proven (E070, via ZI_TWR_TRANSPORT) or client-confirmed in
// SE11 (E071 OBJ_NAME etc., TADIR AUTHOR / DEVCLASS / KORRNUM).
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
  key o.as4pos                             as ItemPos,
      o.object                             as ObjectType,
      o.obj_name                           as ObjectName,
      t.devclass                           as DevClass,
      t.author                             as ObjectAuthor,
      h.as4user                            as TransportOwner,
      h.trstatus                           as RequestStatus,
      cast( h.as4date as abap.char( 8 ) )  as ChangedOn,
      dats_days_between( h.as4date, $session.system_date ) as AgeInDays
}
where o.pgmid = 'R3TR'
  and ( h.trstatus = 'D' or h.trstatus = 'L' )
  and ( o.obj_name like 'Z%' or o.obj_name like 'Y%' )
