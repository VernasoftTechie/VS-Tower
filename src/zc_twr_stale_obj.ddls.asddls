@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Stale Custom Object (query)'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Stale Object', typeNamePlural: 'Stale Objects' }

// Plain projection of ZI_TWR_STALE_OBJ for the Custom Code Cleanup section's
// drill-down list. ChangedOn is YYYYMMDD text (see the anchor).

define view entity ZC_TWR_STALE_OBJ
  as select from ZI_TWR_STALE_OBJ
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key TransportRequest,

  key ItemPos,

      @UI.lineItem:       [{ position: 20 }]
      @UI.selectionField: [{ position: 20 }]
      @EndUserText.label: 'Type'
      ObjectType,

      @UI.lineItem:       [{ position: 30 }]
      @EndUserText.label: 'Object'
      ObjectName,

      @UI.lineItem:       [{ position: 40 }]
      @EndUserText.label: 'Package'
      DevClass,

      @UI.lineItem:       [{ position: 50 }]
      @UI.selectionField: [{ position: 30 }]
      @EndUserText.label: 'Author'
      ObjectAuthor,

      @UI.lineItem:       [{ position: 60 }]
      @EndUserText.label: 'Request Owner'
      TransportOwner,

      @UI.lineItem:       [{ position: 70 }]
      @EndUserText.label: 'Request Status'
      RequestStatus,

      @UI.lineItem:       [{ position: 80 }]
      @EndUserText.label: 'Request Date (YYYYMMDD)'
      ChangedOn,

      @UI.lineItem:       [{ position: 90 }]
      @EndUserText.label: 'Age (days)'
      AgeInDays
}
where AgeInDays >= 180
