@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Security User (anchor)'
@Metadata.ignorePropagatedAnnotations: true

// One row per user master record. USR02 is a kernel-level table, stable
// across every SAP release - unlike PA-infotypes it does not need per-client
// verification, but it is still new on this system (BUILD_ISSUES_LOG.md §1 -
// report the first activation result either way).
// IsLocked / LockCriticality are computed here, not in the consumption view
// (Employee-360 A14: CASE belongs in the interface view, projections only
// list element names). All dates cast to abap.dats defensively (rule #8),
// even though USR02 dates are not known to carry a PDATE-style conversion
// exit the way infotype BEGDA/ENDDA/GBDAT do.
//
// T1 (BUILD_ISSUES_LOG.md): USTYP's data element carries a conversion exit -
// same failure mode as A24 (PDATE on dates), just on a code field instead of
// a date. Fiori preview: "Do not use conversion ext USTYP here." Fixed by
// casting to a plain abap.char, which strips the data element/conversion
// exit exactly like cast(x as abap.dats) does for dates. Fixed here, in the
// interface view, so ZC_TWR_SEC_USER and ZC_TWR_SEC_SUMMARY (both read
// UserType from this view) are both covered by the one change.

define view entity ZI_TWR_SEC_USER
  as select from usr02
{
  key bname                                          as Username,
      cast( ustyp as abap.char( 1 ) )                 as UserType,
      class                                           as UserGroup,
      cast( case when uflag = 0 then ' ' else 'X' end as abap.char( 1 ) ) as IsLocked,
      cast( case when uflag = 0 then 3 else 1 end as abap.int4 ) as LockCriticality,
      cast( erdat as abap.dats )                      as CreatedOnDate,
      cast( trdat as abap.dats )                      as LastPasswordChangeDate,
      cast( gltgb as abap.dats )                      as ValidToDate
}
