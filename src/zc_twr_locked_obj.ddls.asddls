@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Locked Repository Object'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Locked Object', typeNamePlural: 'Locked Objects' }

// Custom Z*/Y* objects currently checked out in a modifiable transport -
// "who has what locked, so I know what not to touch". Same interface view
// as the Custom Code Cleanup section (ZI_TWR_STALE_OBJ, E071 join E070 join
// TADIR, R3TR, TRSTATUS D/L) but WITHOUT the 6-month age filter - every
// open lock, not just the stale ones.

define view entity ZC_TWR_LOCKED_OBJ
  as select from ZI_TWR_STALE_OBJ
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key TransportRequest,

  key ItemPos,

      @UI.lineItem:       [{ position: 20 }]
      @EndUserText.label: 'Type'
      ObjectType,

      @UI.lineItem:       [{ position: 30 }]
      @EndUserText.label: 'Object'
      ObjectName,

      @UI.lineItem:       [{ position: 40 }]
      @EndUserText.label: 'Package'
      DevClass,

      @UI.lineItem:       [{ position: 50 }]
      @UI.selectionField: [{ position: 20 }]
      @EndUserText.label: 'Locked By'
      TransportOwner,

      @UI.lineItem:       [{ position: 60 }]
      @EndUserText.label: 'Author'
      ObjectAuthor,

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
