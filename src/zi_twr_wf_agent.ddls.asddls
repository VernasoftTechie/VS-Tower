@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Work Item Agent (anchor)'
@Metadata.ignorePropagatedAnnotations: true

// One row per (agent, work item) - straight from SWWUSERWI, the table that
// records which work items sit in which user's inbox. Client confirmed the
// field names in SE11 (2026-09-07): USER_ID, WI_ID, WI_STAT.
//
// An item offered to several agents has several SWWUSERWI rows - that is
// intended ("consider all the users"): each agent's inbox count includes
// it. SWWUSERWI's own WI_STAT is used, so no join to SWWWIHEAD is needed
// here. WI_STAT cast defensively (rule #20). No WHERE - the consumption
// view filters to the open statuses.

define view entity ZI_TWR_WF_AGENT
  as select from swwuserwi
{
  key user_id                            as AgentId,
  key wi_id                              as WorkItemId,
      cast( wi_stat as abap.char( 10 ) ) as Status
}
