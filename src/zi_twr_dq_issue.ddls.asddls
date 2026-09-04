@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Data Quality Issue'
@Metadata.ignorePropagatedAnnotations: true

// Stage 1 check set (4 of 6 in the dashboard's Data Quality panel - see
// 02_solution_architecture.md §8). Every UNION branch projects the SAME
// element names/types AND the SAME key markers (Employee-360
// BUILD_ISSUES_LOG.md A5/A6). SeverityCriticality is a literal per branch
// (1 = critical/red, 2 = warning/orange) so no CASE is needed (A14).
// ACTIVE BRANCH COUNT = 4.
//
// Deferred to a later stage (not this commit):
//   - Duplicate Employee   - needs GROUP BY / HAVING (Employee-360's biggest
//                            source of activation errors - A3/A4/A15/A17/
//                            A28/A29). Added once Stage 1-3 are proven green.
//   - Missing Manager      - needs an HRP1001 chief-position relationship ID
//                            Employee-360 itself never confirmed on this
//                            client (BUILD_ISSUES_LOG.md §E).
// "Invalid Position" ships here as MISSING_POSITION (PositionId initial) -
// the verified low-risk proxy - not a dummy-position-code check, since that
// convention is client-specific and unconfirmed.

define view entity ZI_TWR_DQ_ISSUE
  as select from ZI_TWR_EMP_BASIC as Emp
    left outer join ZI_TWR_EMP_CONTACT as Con on Con.EmployeeID = Emp.EmployeeID
{
  key Emp.EmployeeID                                            as EmployeeID,
  key cast( 'MISSING_EMAIL' as abap.char( 20 ) )                as CheckID,
      cast( 'CONTACT' as abap.char( 20 ) )                      as Category,
      cast( 'W' as abap.char( 1 ) )                             as Severity,
      cast( 2 as abap.int4 )                                    as SeverityCriticality,
      cast( 'Email address is missing' as abap.char( 60 ) )     as IssueDescription,
      cast( 'EmailAddress' as abap.char( 30 ) )                 as FieldName
}
where Con.EmailAddress is initial

union all
  select from ZI_TWR_EMP_BASIC as Emp
{
  key Emp.EmployeeID                                            as EmployeeID,
  key cast( 'MISSING_COSTCTR' as abap.char( 20 ) )              as CheckID,
      cast( 'ORG_ASSIGNMENT' as abap.char( 20 ) )               as Category,
      cast( 'C' as abap.char( 1 ) )                             as Severity,
      cast( 1 as abap.int4 )                                    as SeverityCriticality,
      cast( 'Cost center is missing' as abap.char( 60 ) )       as IssueDescription,
      cast( 'CostCenter' as abap.char( 30 ) )                   as FieldName
}
where Emp.CostCenter is initial

union all
  select from ZI_TWR_EMP_BASIC as Emp
{
  key Emp.EmployeeID                                            as EmployeeID,
  key cast( 'MISSING_POSITION' as abap.char( 20 ) )             as CheckID,
      cast( 'ORG_ASSIGNMENT' as abap.char( 20 ) )               as Category,
      cast( 'C' as abap.char( 1 ) )                             as Severity,
      cast( 1 as abap.int4 )                                    as SeverityCriticality,
      cast( 'Position is not assigned' as abap.char( 60 ) )     as IssueDescription,
      cast( 'PositionId' as abap.char( 30 ) )                   as FieldName
}
where Emp.PositionId is initial

union all
  select from ZI_TWR_EMP_BASIC as Emp
    left outer join ZI_TWR_EMP_BANK as Bnk on Bnk.EmployeeID = Emp.EmployeeID
{
  key Emp.EmployeeID                                            as EmployeeID,
  key cast( 'MISSING_BANK' as abap.char( 20 ) )                 as CheckID,
      cast( 'BANK' as abap.char( 20 ) )                         as Category,
      cast( 'C' as abap.char( 1 ) )                             as Severity,
      cast( 1 as abap.int4 )                                    as SeverityCriticality,
      cast( 'Bank account / IBAN missing' as abap.char( 60 ) )  as IssueDescription,
      cast( 'IBAN' as abap.char( 30 ) )                         as FieldName
}
where Bnk.IBAN is initial
