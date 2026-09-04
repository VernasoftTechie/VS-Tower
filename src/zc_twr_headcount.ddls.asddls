@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Headcount Overview'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Headcount', typeNamePlural: 'Headcount Overview' }
@UI.chart: [
  { qualifier: 'ByCompany', chartType: #DONUT,
    dimensions: [ 'CompanyCode' ], measures: [ 'EmployeeCount' ] }
]

// No new interface view - aggregates ZI_TWR_EMP_BASIC directly (Stage 1,
// proven green with 40,529 rows returned). Grouped by CompanyCode +
// PersonnelArea only - NOT region (that needs an org-unit-to-region mapping
// that hasn't been confirmed with the client, so it's not guessed here).
// Plain aggregating view, key on every grouping dimension, no
// @Analytics.query (A30 / Stage 1 §0.13). No DISTINCT needed - EmployeeID is
// the primary key of ZI_TWR_EMP_BASIC.

define view entity ZC_TWR_HEADCOUNT
  as select from ZI_TWR_EMP_BASIC
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key CompanyCode,

      @UI.lineItem:       [{ position: 20 }]
      @UI.selectionField: [{ position: 20 }]
  key PersonnelArea,

      @UI.lineItem: [{ position: 30 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as EmployeeCount
}
group by
  CompanyCode,
  PersonnelArea
