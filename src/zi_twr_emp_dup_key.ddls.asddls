@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Employee Duplicate Key (helper)'
@Metadata.ignorePropagatedAnnotations: true

// Helper aggregate, not exposed to the service directly - only consumed by
// the new DUPLICATE_EMPLOYEE branch in ZI_TWR_DQ_ISSUE. Same GROUP BY +
// COUNT(*) shape already proven throughout this repo (every _SUMMARY view),
// and the same "aggregate helper + self-join" pattern proven end-to-end by
// Stage 3's Background Job Health (ZI_TWR_BGJOB_LATEST -> ZI_TWR_BGJOB_HEALTH).
// No WHERE clause here - a WHERE+GROUP BY combination in one view is
// untested in this repo; blank-name employees are excluded downstream
// instead, in the union branch's own WHERE (a proven construct), not here.

define view entity ZI_TWR_EMP_DUP_KEY
  as select from ZI_TWR_EMP_BASIC
{
  key LastName,
  key FirstName,
  key DateOfBirth,
      cast( count( * ) as abap.int4 ) as MatchCount
}
group by
  LastName,
  FirstName,
  DateOfBirth
