@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Work Item (anchor)'
@Metadata.ignorePropagatedAnnotations: true

// The 3-field core (WI_ID / WI_TYPE / WI_STAT) is confirmed green (T4 was an
// EDM naming collision, not a field problem). Extended 2026-09-07 for the
// Workflow date-range section - client checked every added field name in
// SE11 first (00_context_and_decisions.md change log):
//   WI_TEXT    - work item description text
//   WI_CD      - creation date        ("raised" date)
//   WI_AED     - last change date     ("processed" date proxy; always set)
//   WI_AAGENT  - "Actual Agent of Work Item" - who executed it
//
// Dates exposed as blank-safe TEXT (abap.char(8)), not Edm.Date - the exact
// T2 fix. Range filtering from the UI is then a string comparison on the
// YYYYMMDD form, which sorts chronologically, so `$filter ge/le` still works.
// Sidesteps the "blank Edm.Date breaks the Fiori runtime" trap entirely.
//
// WorkItemType/Status/ActualAgent exposed RAW (cast defensively per rule #20)
// - same "don't guess the meaning, just expose the code" discipline as
// Transport. No criticality - status-code meanings still not confirmed.

define view entity ZI_TWR_WORKITEM
  as select from swwwihead
{
  key wi_id                              as WorkItemId,
      cast( wi_type as abap.char( 4 ) )  as WorkItemType,
      cast( wi_stat as abap.char( 20 ) ) as Status,
      wi_text                            as WorkItemText,
      cast( wi_aagent as abap.char( 14 ) ) as ActualAgent,
      case when wi_cd is initial then cast( '' as abap.char( 8 ) )
           else cast( wi_cd as abap.char( 8 ) ) end   as CreatedOn,
      case when wi_aed is initial then cast( '' as abap.char( 8 ) )
           else cast( wi_aed as abap.char( 8 ) ) end  as ChangedOn
}
