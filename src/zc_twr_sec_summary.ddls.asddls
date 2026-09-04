@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Security Summary'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Security Group', typeNamePlural: 'Security Summary' }
@UI.chart: [
  { qualifier: 'ByLockStatus', chartType: #DONUT,
    dimensions: [ 'IsLocked' ], measures: [ 'UserCount' ] }
]

// Plain aggregating view entity, key on every grouping dimension - NOT
// @Analytics.query (Employee-360 A30 / Stage 1 §0.13). No DISTINCT needed on
// the count - BNAME is the primary key of USR02, so grouping by UserType +
// IsLocked cannot multiply rows per user the way a join-based check can
// (unlike ZC_TWR_DQ_SUMMARY, Stage 1, which groups over a UNION).

define view entity ZC_TWR_SEC_SUMMARY
  as select from ZI_TWR_SEC_USER
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key UserType,

      @UI.lineItem:       [{ position: 20 }]
      @UI.selectionField: [{ position: 20 }]
  key IsLocked,

      @UI.lineItem: [{ position: 30 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as UserCount
}
group by
  UserType,
  IsLocked
