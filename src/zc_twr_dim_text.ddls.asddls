@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Dimension Texts'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Dimension Text', typeNamePlural: 'Dimension Texts' }

// One place to resolve the coded values shown around the dashboard to their
// business name - company code, personnel area, employee group, payroll
// area. Client ask (2026-09-07): "show descriptions for CC and other main
// elements". Kept as one UNION so it's a single entity, a single UI read,
// a single service exposure - the UI filters on DimType.
//
// All four are plain, long-stable SAP config text tables (T001 / T500P /
// T501T / T549T) - basic org/config, not HR infotype text tables, so the
// A10 "don't invent text-table field names" risk is low here. Still: field
// names to be confirmed on first activation like everything new.
//
// UNION rules applied (BUILD_ISSUES_LOG.md §0.5): every branch marks the
// same elements key (DimType, DimCode), every computed element has an
// explicit `as`, all types line up. Language-dependent branches (T501T,
// T549T) filter on the logon language via $session.system_language;
// T001 / T500P texts are language-independent.
//
// Cost centre (CSKT) and org unit / position (HRP1000) are deliberately
// NOT here - both are validity- and controlling-area / plan-version
// dependent, a separate, more careful step.

define view entity ZC_TWR_DIM_TEXT
  as select from t001
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key cast( 'COMPANY' as abap.char( 12 ) )        as DimType,

      @UI.lineItem:       [{ position: 20 }]
  key cast( bukrs as abap.char( 20 ) )            as DimCode,

      @UI.lineItem:       [{ position: 30 }]
      cast( butxt as abap.char( 60 ) )            as DimText
}

union all
  select from t500p
{
  key cast( 'PERS_AREA' as abap.char( 12 ) )      as DimType,
  key cast( persa as abap.char( 20 ) )            as DimCode,
      cast( name1 as abap.char( 60 ) )            as DimText
}

union all
  select from t501t
{
  key cast( 'EMP_GROUP' as abap.char( 12 ) )      as DimType,
  key cast( persg as abap.char( 20 ) )            as DimCode,
      cast( ptext as abap.char( 60 ) )            as DimText
}
where sprsl = $session.system_language

union all
  select from t549t
{
  key cast( 'PAYROLL_AREA' as abap.char( 12 ) )   as DimType,
  key cast( abkrs as abap.char( 20 ) )            as DimCode,
      cast( atext as abap.char( 60 ) )            as DimText
}
where sprsl = $session.system_language
