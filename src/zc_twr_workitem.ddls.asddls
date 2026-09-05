@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Work Item (query)'
@Metadata.allowExtensions: true
@UI.headerInfo: {
  typeName: 'Work Item',
  typeNamePlural: 'Workflow Items'
}

// Plain "select from" query view - same shape as every prior stage. No
// criticality (status-code meanings not yet known) and no dates (not in
// this cut's anchor - see ZI_TWR_WORKITEM).

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
      Status
}
