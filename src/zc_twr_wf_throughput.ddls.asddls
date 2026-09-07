@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Workflow Throughput'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Workflow Throughput', typeNamePlural: 'Workflow Throughput' }

// Feeds the Workflow section's date-range metrics. One row per
// (Status, RaisedOn, ProcessedOn, ItemCount) - the UI filters on the date
// columns (YYYYMMDD string compare) and sums:
//   raised in range     = SUM(ItemCount) where CreatedOn in [from, to]
//   processed in range  = SUM(ItemCount) where ChangedOn in [from, to]
//                         and Status is a final one
// Same plain aggregating shape as ZC_TWR_WORKITEM_SUMMARY - key on every
// grouping dimension, COUNT(*) measure, no @Analytics.query. Dates are the
// already-computed text fields from ZI_TWR_WORKITEM (rule #14 - the CASE
// lives in the interface view; this view groups by the plain result).

define view entity ZC_TWR_WF_THROUGHPUT
  as select from ZI_TWR_WORKITEM
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key Status,

      @UI.lineItem:       [{ position: 20 }]
      @UI.selectionField: [{ position: 20 }]
  key CreatedOn,

      @UI.lineItem:       [{ position: 30 }]
      @UI.selectionField: [{ position: 30 }]
  key ChangedOn,

      @UI.lineItem: [{ position: 40 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as ItemCount
}
group by
  Status,
  CreatedOn,
  ChangedOn
