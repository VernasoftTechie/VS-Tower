@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Active User IDs'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Active User Group', typeNamePlural: 'Active User Groups' }

// "Which IDs are live and being used" - for an ABAP manager scoping work.
// Unlocked USR02 accounts only, grouped by user type x last-logon recency.
// Same plain GROUP-BY shape as ZC_TWR_SEC_SUMMARY; the recency bucket is a
// plain field on ZI_TWR_SEC_USER (the CASE lives there - rule #14).

define view entity ZC_TWR_SEC_ACTIVE
  as select from ZI_TWR_SEC_USER
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key UserType,

      @UI.lineItem:       [{ position: 20 }]
      @UI.selectionField: [{ position: 20 }]
      @EndUserText.label: 'Last Logon'
  key LogonRecency,

      @UI.lineItem: [{ position: 30 }]
      @EndUserText.label: 'Users'
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as UserCount
}
where IsLocked <> 'X'
group by
  UserType,
  LogonRecency
