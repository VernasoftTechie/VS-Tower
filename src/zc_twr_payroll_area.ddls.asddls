@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Payroll Area Overview'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Payroll Area', typeNamePlural: 'Payroll Area Overview' }
@UI.chart: [
  { qualifier: 'ByArea', chartType: #DONUT,
    dimensions: [ 'PayrollArea' ], measures: [ 'EmployeeCount' ] }
]

// Stage 6, replaces the retired interface-catalog approach (client
// direction: no custom tables, standard tables only - see
// 00_context_and_decisions.md §5 / 02_solution_architecture.md §20).
// Aggregates ZI_TWR_EMP_BASIC (Stage 1, proven green) by PayrollArea -
// zero new interface view, zero new custom DDIC, same shape as
// ZC_TWR_HEADCOUNT (Stage 5). Every distinct ABKRS in active use on PA0001
// shows up automatically - no manual catalog to maintain.

define view entity ZC_TWR_PAYROLL_AREA
  as select from ZI_TWR_EMP_BASIC
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key PayrollArea,

      @UI.lineItem: [{ position: 20 }]
      @Aggregation.default: #SUM
      cast( count( * ) as abap.int4 )   as EmployeeCount
}
group by
  PayrollArea
