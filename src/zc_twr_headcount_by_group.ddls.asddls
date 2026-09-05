@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Headcount by Employee Group'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Employee Group', typeNamePlural: 'Headcount by Employee Group' }
@UI.chart: [
  { qualifier: 'ByGroup', chartType: #DONUT,
    dimensions: [ 'EmployeeGroup' ], measures: [ 'EmployeeCount' ] }
]

// Extends Stage 5 (Headcount Overview) with a second breakdown - regular /
// contract / intern etc. splits, a common HR-ops lens the original
// Company x Personnel Area view doesn't cover. No new interface view (reuses
// ZI_TWR_EMP_BASIC, now carrying EmployeeGroup/EmployeeSubgroup), same
// aggregation shape as every other _SUMMARY/_OVERVIEW view in this repo.

define view entity ZC_TWR_HEADCOUNT_BY_GROUP
  as select from ZI_TWR_EMP_BASIC
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key EmployeeGroup,

      @UI.lineItem:       [{ position: 20 }]
      @UI.selectionField: [{ position: 20 }]
  key EmployeeSubgroup,

      @UI.lineItem: [{ position: 30 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as EmployeeCount
}
group by
  EmployeeGroup,
  EmployeeSubgroup
