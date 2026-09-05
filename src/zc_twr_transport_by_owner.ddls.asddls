@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Transport by Owner'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Owner Transport Count', typeNamePlural: 'Transport by Owner' }

// Manager ask (2026-09-05): "on which IDs how many TRs are left open and how
// many moved/released" - a per-developer/consultant workload view, not just
// a system-wide donut. Same aggregation shape as ZC_TWR_WORKITEM_SUMMARY
// (already confirmed clean on this system - group by 2 dimensions, plain
// COUNT(*), no @Analytics.query): group by Owner x RequestStatus here
// instead of WorkItemType x Status. The UI pivots this into one row per
// Owner (Open / Released / Total columns) - no new CDS risk taken to get
// that shape, all of it is client-side on an already-proven query pattern.
// No DISTINCT needed - TRKORR is E070's primary key, so grouping by
// Owner x RequestStatus alone cannot multiply rows.

define view entity ZC_TWR_TRANSPORT_BY_OWNER
  as select from ZI_TWR_TRANSPORT
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key Owner,

      @UI.lineItem:       [{ position: 20 }]
      @UI.selectionField: [{ position: 20 }]
  key RequestStatus,

      StatusCriticality,

      @UI.lineItem: [{ position: 30 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as RequestCount
}
group by
  Owner,
  RequestStatus,
  StatusCriticality
