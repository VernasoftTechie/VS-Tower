@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Background Job Summary'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Job Status', typeNamePlural: 'Background Job Summary' }
@UI.chart: [
  { qualifier: 'ByStatus', chartType: #DONUT,
    dimensions: [ 'Status' ], measures: [ 'JobStepCount' ] }
]

// Plain aggregating view entity, key on the grouping dimension - NOT
// @Analytics.query (Employee-360 A30 / Stage 1 §0.13). No DISTINCT needed -
// JobName + JobCount is the primary key of TBTCO, so grouping by Status
// alone cannot multiply rows (same reasoning as ZC_TWR_SEC_SUMMARY, Stage 2).

define view entity ZC_TWR_BGJOB_SUMMARY
  as select from ZI_TWR_BGJOB
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key Status,

      @UI.lineItem: [{ position: 20 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as JobStepCount
}
group by
  Status
