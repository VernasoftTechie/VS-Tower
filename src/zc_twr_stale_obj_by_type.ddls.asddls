@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Stale Objects by Type'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Stale Objects by Type', typeNamePlural: 'Stale Objects by Type' }

// Secondary breakdown for the Custom Code Cleanup section - programs vs
// classes vs function groups vs DDIC etc. ObjectType is the 4-char R3TR
// object type (PROG / CLAS / FUGR / TABL ...).

define view entity ZC_TWR_STALE_OBJ_BY_TYPE
  as select from ZI_TWR_STALE_OBJ
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
      @EndUserText.label: 'Type'
  key ObjectType,

      @UI.lineItem: [{ position: 20 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as ObjectCount
}
group by
  ObjectType
