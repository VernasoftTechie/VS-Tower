@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Employee Contact'
@Metadata.ignorePropagatedAnnotations: true

// Email address only (subtype 0010). Field names copied from Employee-360's
// ZI_HR360_EMP_CONTACT, already proven correct on this system.

define view entity ZI_TWR_EMP_CONTACT
  as select from pa0105
{
  key pernr       as EmployeeID,
      usrid_long  as EmailAddress
}
where subty = '0010'
  and begda <= $session.system_date
  and endda >= $session.system_date
