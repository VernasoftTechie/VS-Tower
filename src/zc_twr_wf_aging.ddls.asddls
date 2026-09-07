@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Workflow Aging'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Workflow Aging', typeNamePlural: 'Workflow Aging' }

// Open work items grouped by the date they were raised, so the UI can work
// out how old the current backlog is (0-7 days / 8-30 / 30+). Always
// as-of-now. Server-side filter to the open statuses keeps this small (the
// current backlog, not all of history). RaisedOn is the already-computed
// text field from ZI_TWR_WORKITEM (rule #14).

define view entity ZC_TWR_WF_AGING
  as select from ZI_TWR_WORKITEM
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key CreatedOn,

      @UI.lineItem: [{ position: 20 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as OpenCount
}
where Status <> 'COMPLETED'
  and Status <> 'CANCELLED'
group by
  CreatedOn
