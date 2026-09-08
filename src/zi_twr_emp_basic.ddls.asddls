@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Employee Basic (anchor)'
@Metadata.ignorePropagatedAnnotations: true

// Anchor: one row per active employee, from PA0001 (date-valid). Field names
// and casts copied verbatim from Employee-360's ZI_HR360_EMP_BASIC, already
// proven correct on this system (BUILD_ISSUES_LOG.md #0 / #1). Deliberately
// NOT sourced from ZI_HR360_EMP_BASIC itself - that entity carries #CHECK +
// a DCL, which would silently reintroduce the authorization dependency
// decision D2 rules out. No PA0001-STAT2 on this system - not selected here.
//
// Trimmed 2026-09-08: the Data Quality feature was retired (Employee 360 owns
// employee master-data health now). This view only feeds the Workforce
// Context cards (ZC_TWR_HEADCOUNT / _BY_GROUP / ZC_TWR_PAYROLL_AREA), so the
// DQ-only fields (CostCenter, PositionId) and the PA0002 join (LastName,
// FirstName, DateOfBirth - only used by the retired duplicate-employee check)
// are gone. PayrollArea (ABKRS) / EmployeeGroup (PERSG) / EmployeeSubgroup
// (PERSK) cast to plain char defensively (rule #20 / T1 precedent).

define view entity ZI_TWR_EMP_BASIC
  as select from pa0001 as O
{
  key O.pernr                           as EmployeeID,
      O.bukrs                           as CompanyCode,
      O.werks                           as PersonnelArea,
      cast( O.abkrs as abap.char( 2 ) ) as PayrollArea,
      cast( O.persg as abap.char( 1 ) ) as EmployeeGroup,
      cast( O.persk as abap.char( 2 ) ) as EmployeeSubgroup
}
where O.begda <= $session.system_date
  and O.endda >= $session.system_date
