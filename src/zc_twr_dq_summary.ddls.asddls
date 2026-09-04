@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - DQ Summary by Category'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'DQ Category', typeNamePlural: 'Data Quality by Category' }
@UI.chart: [
  { qualifier: 'ByCategory', chartType: #DONUT,
    dimensions: [ 'Category' ], measures: [ 'IssueCount' ] }
]

// Plain aggregating view entity with key on every grouping dimension - NOT
// @Analytics.query (Employee-360 A30: analytical query views have no key
// fields, and an OData V4 UI service binding needs a key on every exposed
// entity type). count( distinct EmployeeID ) because the same employee can
// appear under the same Category via more than one CheckID (A4: COUNT on a
// column reachable via a join that can multiply rows needs DISTINCT).

define view entity ZC_TWR_DQ_SUMMARY
  as select from ZI_TWR_DQ_ISSUE
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key Category,

      @UI.lineItem:       [{ position: 20 }]
      @UI.selectionField: [{ position: 20 }]
  key Severity,

      @UI.lineItem: [{ position: 30 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )                    as IssueCount,

      @UI.lineItem: [{ position: 40 }]
      @Aggregation.default: #SUM
      cast( count( distinct EmployeeID ) as abap.int4 )   as EmployeeCount
}
group by
  Category,
  Severity
