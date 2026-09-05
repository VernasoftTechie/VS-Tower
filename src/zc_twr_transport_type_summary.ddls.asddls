@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Transport Summary by Type'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Transport Type', typeNamePlural: 'Transport Summary by Type' }
@UI.chart: [
  { qualifier: 'ByType', chartType: #DONUT,
    dimensions: [ 'RequestType' ], measures: [ 'RequestCount' ] }
]

// Extends Stage 4 (Transport Monitor) with a second slice - workbench vs
// customizing vs other, using RequestType (already proven, already cast
// defensively in ZI_TWR_TRANSPORT). No new interface view, no new table,
// same aggregation shape as every other _SUMMARY view in this repo.

define view entity ZC_TWR_TRANSPORT_TYPE_SUMMARY
  as select from ZI_TWR_TRANSPORT
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key RequestType,

      @UI.lineItem: [{ position: 20 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as RequestCount
}
group by
  RequestType
