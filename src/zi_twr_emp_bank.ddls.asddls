@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Employee Bank'
@Metadata.ignorePropagatedAnnotations: true

// Main bank connection only (subtype 0). Field names copied from
// Employee-360's ZI_HR360_EMP_BANK, already proven correct on this system.

define view entity ZI_TWR_EMP_BANK
  as select from pa0009
{
  key pernr  as EmployeeID,
      bankl  as BankKey,
      bankn  as BankAccount,
      iban   as IBAN
}
where subty = '0'
  and begda <= $session.system_date
  and endda >= $session.system_date
