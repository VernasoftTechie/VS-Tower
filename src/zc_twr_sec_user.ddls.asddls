@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Security User (query)'
@Metadata.allowExtensions: true
@UI.headerInfo: {
  typeName: 'Security User',
  typeNamePlural: 'Security Users'
}

// Plain "select from" query view - same shape as ZC_TWR_DQ_ISSUE (Stage 1,
// proven green). Only element names + @UI - all computed logic lives in
// ZI_TWR_SEC_USER.

define view entity ZC_TWR_SEC_USER
  as select from ZI_TWR_SEC_USER
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key Username,

      @UI.lineItem:       [{ position: 20 }]
      @UI.selectionField: [{ position: 20 }]
      UserType,

      @UI.lineItem:       [{ position: 30 }]
      @UI.selectionField: [{ position: 30 }]
      UserGroup,

      @UI.lineItem: [{ position: 40, criticality: 'LockCriticality' }]
      IsLocked,

      LockCriticality,

      @UI.lineItem:       [{ position: 50 }]
      @UI.identification: [{ position: 50 }]
      CreatedOnDate,

      @UI.lineItem:       [{ position: 60 }]
      @UI.identification: [{ position: 60 }]
      LastPasswordChangeDate,

      @UI.lineItem:       [{ position: 70 }]
      @UI.identification: [{ position: 70 }]
      ValidToDate
}
