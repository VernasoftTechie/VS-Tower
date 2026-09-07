@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Workflow Pending by Agent'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Pending by Agent', typeNamePlural: 'Workflow Pending by Agent' }

// "Whose inbox is the bottleneck" - one row per agent, counting the work
// items currently in that agent's inbox that are not finished. Always
// as-of-now (not date-bounded): a date range can't sensibly say what is
// still stuck. Same plain aggregating shape as ZC_TWR_TRANSPORT_BY_OWNER.
//
// 'COMPLETED' / 'CANCELLED' are real WI_STAT values (seen in the live data
// via ZC_TWR_WORKITEM_SUMMARY) - not guessed.

define view entity ZC_TWR_WF_BY_AGENT
  as select from ZI_TWR_WF_AGENT
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
      @EndUserText.label: 'Agent'
  key AgentId,

      @UI.lineItem: [{ position: 20 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as PendingCount
}
where Status <> 'COMPLETED'
  and Status <> 'CANCELLED'
group by
  AgentId
