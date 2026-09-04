@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Job Health Summary'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Job Health Status', typeNamePlural: 'Job Health Summary' }
@UI.chart: [
  { qualifier: 'ByStatus', chartType: #DONUT,
    dimensions: [ 'Status' ], measures: [ 'JobNameCount' ] }
]

// Plain aggregating view entity, key on the grouping dimension - NOT
// @Analytics.query (Employee-360 A30 / Stage 1 §0.13). No DISTINCT needed -
// JobName is already unique in ZI_TWR_BGJOB_HEALTH (one row per name, by
// construction), so grouping by Status alone cannot multiply rows.
// "JobNameCount" (not "JobStepCount", the measure name used in the history
// summary ZC_TWR_BGJOB_SUMMARY) - deliberately different name, since this
// counts distinct job NAMES pending/failed, not raw job STEPS.

define view entity ZC_TWR_BGJOB_HEALTH_SUMMARY
  as select from ZI_TWR_BGJOB_HEALTH
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key Status,

      @UI.lineItem: [{ position: 20 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as JobNameCount
}
group by
  Status
