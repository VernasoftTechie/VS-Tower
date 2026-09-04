@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Background Job (query)'
@Metadata.allowExtensions: true
@UI.headerInfo: {
  typeName: 'Background Job',
  typeNamePlural: 'Background Jobs'
}

// Plain "select from" query view - same shape as ZC_TWR_DQ_ISSUE /
// ZC_TWR_SEC_USER (Stages 1-2, proven green).

define view entity ZC_TWR_BGJOB
  as select from ZI_TWR_BGJOB
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key JobName,

      @UI.lineItem:       [{ position: 20 }]
  key JobCount,

      @UI.lineItem: [{ position: 30, criticality: 'StatusCriticality' }]
      @UI.selectionField: [{ position: 20 }]
      Status,

      StatusCriticality,

      @UI.lineItem:       [{ position: 40 }]
      @UI.selectionField: [{ position: 30 }]
      StartDate,

      @UI.lineItem:       [{ position: 50 }]
      @UI.identification: [{ position: 50 }]
      StartTime,

      @UI.lineItem:       [{ position: 60 }]
      @UI.identification: [{ position: 60 }]
      EndDate,

      @UI.lineItem:       [{ position: 70 }]
      @UI.identification: [{ position: 70 }]
      EndTime
}
