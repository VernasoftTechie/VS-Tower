@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - DQ Issue (query)'
@Metadata.allowExtensions: true
@UI.headerInfo: {
  typeName: 'Data Quality Issue',
  typeNamePlural: 'Data Quality Issues'
}

// Plain "select from" query view - NOT "as projection on" (Employee-360
// A18/A19/B2: a transactional projection must belong to a RAP BO; this repo
// has none, by decision D1). Only element names + @UI here - all computed
// logic already lives in ZI_TWR_DQ_ISSUE (projection-view rule, Employee-360
// BUILD_ISSUES_LOG.md §"Projection views").

define view entity ZC_TWR_DQ_ISSUE
  as select from ZI_TWR_DQ_ISSUE
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key EmployeeID,

      @UI.lineItem:       [{ position: 20 }]
      @UI.identification: [{ position: 20 }]
  key CheckID,

      @UI.lineItem:       [{ position: 30 }]
      @UI.selectionField: [{ position: 20 }]
      Category,

      @UI.lineItem: [{ position: 40, criticality: 'SeverityCriticality' }]
      Severity,

      SeverityCriticality,

      @UI.lineItem:       [{ position: 50 }]
      @UI.identification: [{ position: 50 }]
      IssueDescription,

      @UI.lineItem:       [{ position: 60 }]
      @UI.identification: [{ position: 60 }]
      FieldName
}
