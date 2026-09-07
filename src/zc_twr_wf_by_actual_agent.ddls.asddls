@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Workflow Processed by Agent'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Processed by Agent', typeNamePlural: 'Workflow Processed by Agent' }

// "Who cleared the most" - one row per (actual agent, processed date),
// counting completed work items. The UI filters ProcessedOn to the chosen
// date range (YYYYMMDD string compare) and sums per agent. Uses
// SWWWIHEAD-WI_AAGENT ("Actual Agent of Work Item", client-confirmed) via
// ZI_TWR_WORKITEM, not the SWWUSERWI inbox distribution.
//
// 'COMPLETED' is a real WI_STAT value (seen in the live data).

define view entity ZC_TWR_WF_BY_ACTUAL_AGENT
  as select from ZI_TWR_WORKITEM
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
      @EndUserText.label: 'Actual Agent'
  key ActualAgent,

      @UI.lineItem:       [{ position: 20 }]
      @UI.selectionField: [{ position: 20 }]
      @EndUserText.label: 'Processed On (YYYYMMDD)'
  key ChangedOn,

      @UI.lineItem: [{ position: 30 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as ProcessedCount
}
where Status = 'COMPLETED'
group by
  ActualAgent,
  ChangedOn
