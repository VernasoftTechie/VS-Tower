@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Stale Objects by Owner'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Stale Objects by Owner', typeNamePlural: 'Stale Objects by Owner' }

// "Which developer has the most abandoned objects" - the primary lens for
// the Custom Code Cleanup section. Same plain GROUP-BY shape as
// ZC_TWR_TRANSPORT_BY_OWNER. Counts E071 object-occurrences; an object
// locked in two old requests counts twice (two things to clean up).

define view entity ZC_TWR_STALE_OBJ_BY_OWNER
  as select from ZI_TWR_STALE_OBJ
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
      @EndUserText.label: 'Author'
  key Author,

      @UI.lineItem: [{ position: 20 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as ObjectCount
}
group by
  Author
