@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Employee Basic (anchor)'
@Metadata.ignorePropagatedAnnotations: true

// Anchor: one row per active employee, PA0001 (date-valid) left-joined to
// PA0002 (date-valid) for name / date of birth. Field names and casts copied
// verbatim from Employee-360's ZI_HR360_EMP_BASIC, already proven correct on
// this system (BUILD_ISSUES_LOG.md #0 / #1). Deliberately NOT sourced from
// ZI_HR360_EMP_BASIC itself - that entity carries #CHECK + a DCL, which would
// silently reintroduce the authorization dependency decision D2 rules out.
// No PA0001-STAT2 on this system - not selected here either.
//
// PayrollArea (ABKRS) added for Stage 6 (Payroll Areas Overview) - a
// DIFFERENT field from PersonnelArea (WERKS) above, common SAP naming trap.
// Cast to plain char defensively (rule #20/T1 precedent) even though no
// conversion-exit error has been seen on ABKRS yet - cheaper to cast now
// than find out at runtime. This view already feeds Stage 1 (ZI_TWR_DQ_ISSUE)
// and Stage 5 (ZC_TWR_HEADCOUNT); adding a field is additive/backward
// compatible, doesn't change either of those.

define view entity ZI_TWR_EMP_BASIC
  as select from pa0001 as O
    left outer join pa0002 as P on  P.pernr = O.pernr
                                and P.begda <= $session.system_date
                                and P.endda >= $session.system_date
{
  key O.pernr                       as EmployeeID,
      O.bukrs                       as CompanyCode,
      O.werks                       as PersonnelArea,
      cast( O.abkrs as abap.char( 2 ) ) as PayrollArea,
      O.kostl                       as CostCenter,
      O.plans                       as PositionId,
      P.nachn                       as LastName,
      P.vorna                       as FirstName,
      cast( P.gbdat as abap.dats )  as DateOfBirth
}
where O.begda <= $session.system_date
  and O.endda >= $session.system_date
