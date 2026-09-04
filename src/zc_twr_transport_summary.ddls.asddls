@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Transport Summary'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Transport Status', typeNamePlural: 'Transport Summary' }
@UI.chart: [
  { qualifier: 'ByStatus', chartType: #DONUT,
    dimensions: [ 'RequestStatus' ], measures: [ 'RequestCount' ] }
]

// Plain aggregating view entity, key on the grouping dimension - NOT
// @Analytics.query (Employee-360 A30 / Stage 1 §0.13). No DISTINCT needed -
// TRKORR is the primary key of E070, so grouping by RequestStatus alone
// cannot multiply rows.

define view entity ZC_TWR_TRANSPORT_SUMMARY
  as select from ZI_TWR_TRANSPORT
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key RequestStatus,

      @UI.lineItem: [{ position: 20 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as RequestCount
}
group by
  RequestStatus
