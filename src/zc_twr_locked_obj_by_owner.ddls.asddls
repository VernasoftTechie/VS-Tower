@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Locked Objects by Owner'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Locked Objects by Owner', typeNamePlural: 'Locked Objects by Owner' }

// "How many objects each developer / consultant ID has locked in an open
// transport right now." Same GROUP-BY shape as ZC_TWR_STALE_OBJ_BY_OWNER,
// grouped on the request owner (who holds the lock) rather than the object
// author, and with no age filter.

define view entity ZC_TWR_LOCKED_OBJ_BY_OWNER
  as select from ZI_TWR_STALE_OBJ
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
      @EndUserText.label: 'Locked By'
  key TransportOwner,

      @UI.lineItem: [{ position: 20 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as ObjectCount
}
group by
  TransportOwner
