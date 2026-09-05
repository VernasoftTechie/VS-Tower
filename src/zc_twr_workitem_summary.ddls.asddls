@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Work Item Summary'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Work Item Status', typeNamePlural: 'Work Item Summary' }
@UI.chart: [
  { qualifier: 'ByStatus', chartType: #DONUT,
    dimensions: [ 'Status' ], measures: [ 'ItemCount' ] }
]

// Plain aggregating view entity, key on both grouping dimensions - NOT
// @Analytics.query (Employee-360 A30 / Stage 1 §0.13). No DISTINCT needed -
// WorkItemId is the primary key of SWWWIHEAD, so grouping by Type x Status
// alone cannot multiply rows. Grouped by both dimensions (not Status alone)
// since the codes' real meaning isn't confirmed yet - the cross-tab gives
// more to interpret against once it is.

define view entity ZC_TWR_WORKITEM_SUMMARY
  as select from ZI_TWR_WORKITEM
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key WorkItemType,

      @UI.lineItem:       [{ position: 20 }]
      @UI.selectionField: [{ position: 20 }]
  key Status,

      @UI.lineItem: [{ position: 30 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as ItemCount
}
group by
  WorkItemType,
  Status
