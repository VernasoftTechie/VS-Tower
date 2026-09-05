@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Work Item (anchor)'
@Metadata.ignorePropagatedAnnotations: true

// Conservative first cut. Client confirmed SWWWIHEAD/SWWUSERWI are in force
// on this system, but field names beyond WI_ID/WI_TYPE/WI_STAT are moderate
// confidence, not TBTCO/E070-level certain (00_context_and_decisions.md §8).
// SWWUSERWI (agent assignment / "manager inbox") deliberately NOT touched -
// higher uncertainty, and the agent model (user vs. position vs. org unit)
// needs more care than a plain foreign key. Dates deliberately NOT included
// in this first cut either, even as text - one more unverified field name
// (WI_CD/WI_CT) is one more way this could fail to activate; add them once
// this 3-field core is confirmed green (same "grow from a working core"
// rule, applied more conservatively than usual given the lower confidence
// on this table class).
//
// WorkItemType/Status exposed RAW, not filtered to guessed values - the same
// "don't guess the meaning, just expose the code" discipline that worked for
// Transport's RequestType/RequestStatus. Cast defensively per rule #20 (T1
// precedent - code fields on this system regularly carry a conversion exit).
// No criticality assigned - status-code meanings aren't known well enough
// yet to color-code them safely.

define view entity ZI_TWR_WORKITEM
  as select from swwwihead
{
  key wi_id                             as WorkItemId,
      cast( wi_type as abap.char( 2 ) ) as WorkItemType,
      cast( wi_stat as abap.char( 10 ) ) as Status
}
