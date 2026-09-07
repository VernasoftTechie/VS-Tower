@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Work Item Agent (anchor)'
@Metadata.ignorePropagatedAnnotations: true

// One row per (agent, work item) - which work items sit in which user's
// inbox. SWWUSERWI has USER_ID and WI_ID (client-confirmed) but NOT a
// status column (first activation: "The column WI_STAT is unknown"), so
// the status comes from an inner join to ZI_TWR_WORKITEM on the work-item
// id - which also reuses its defensive WI_STAT cast. WI_ID is the primary
// key of SWWWIHEAD, so the join is 1:1 and cannot multiply rows.
//
// An item offered to several agents has several SWWUSERWI rows - that is
// intended ("consider all the users"): each agent's inbox count includes
// it. No WHERE here - the consumption view filters to the open statuses.

define view entity ZI_TWR_WF_AGENT
  as select from swwuserwi as u
    inner join ZI_TWR_WORKITEM as w
      on w.WorkItemId = u.wi_id
{
  key u.user_id  as AgentId,
  key u.wi_id    as WorkItemId,
      w.Status    as Status
}
