@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Dimension Texts'
@Metadata.allowExtensions: true
@UI.headerInfo: { typeName: 'Dimension Text', typeNamePlural: 'Dimension Texts' }

// Plain projection of ZI_TWR_DIM_TEXT for OData exposure. The UI reads this
// once and builds a {DimType: {DimCode: DimText}} lookup - see _dimLabel in
// Dashboard.controller.js.

define view entity ZC_TWR_DIM_TEXT
  as select from ZI_TWR_DIM_TEXT
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key DimType,

      @UI.lineItem:       [{ position: 20 }]
      @UI.selectionField: [{ position: 20 }]
  key DimCode,

      @UI.lineItem: [{ position: 30 }]
      DimText
}
