@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Work Item (query)'
@Metadata.allowExtensions: true
@UI.headerInfo: {
  typeName: 'Work Item',
  typeNamePlural: 'Workflow Items'
}

// Plain "select from" query view. Dates are text (see ZI_TWR_WORKITEM) so the
// Workflow section's date-range picker filters them as YYYYMMDD strings.
// Explicit @EndUserText.label on the added elements (rule #21) - WI_TEXT /
// WI_AAGENT carry their own data-element labels which may not read well.

define view entity ZC_TWR_WORKITEM
  as select from ZI_TWR_WORKITEM
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key WorkItemId,

      @UI.lineItem:       [{ position: 20 }]
      @UI.selectionField: [{ position: 20 }]
      WorkItemType,

      @UI.lineItem:       [{ position: 30 }]
      @UI.selectionField: [{ position: 30 }]
      Status,

      @UI.lineItem:       [{ position: 40 }]
      @EndUserText.label: 'Description'
      WorkItemText,

      @UI.lineItem:       [{ position: 50 }]
      @EndUserText.label: 'Actual Agent'
      ActualAgent,

      @UI.lineItem:       [{ position: 60 }]
      @UI.selectionField: [{ position: 40 }]
      @EndUserText.label: 'Raised On (YYYYMMDD)'
      CreatedOn,

      @UI.lineItem:       [{ position: 70 }]
      @UI.selectionField: [{ position: 50 }]
      @EndUserText.label: 'Processed On (YYYYMMDD)'
      ChangedOn
}
