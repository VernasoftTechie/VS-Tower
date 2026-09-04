@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Interface Catalog (query)'
@Metadata.allowExtensions: true
@UI.headerInfo: {
  typeName: 'Monitored Interface',
  typeNamePlural: 'Interface Catalog'
}

// Plain "select from" query view - same shape as every prior stage. Ships
// empty; once rows are maintained (SE16N, or SM30 if a maintenance
// generator is created - see the repo README) this list becomes the seed
// data for Stage 7 (Integration Monitoring).

define view entity ZC_TWR_CFG_IFACE
  as select from ZI_TWR_CFG_IFACE
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key InterfaceId,

      @UI.lineItem:       [{ position: 20 }]
      @UI.identification: [{ position: 20 }]
      InterfaceName,

      @UI.lineItem:       [{ position: 30 }]
      @UI.selectionField: [{ position: 20 }]
      LogTechnique,

      @UI.lineItem:       [{ position: 40 }]
      @UI.identification: [{ position: 40 }]
      LogObject,

      @UI.lineItem:       [{ position: 50 }]
      @UI.identification: [{ position: 50 }]
      ExpectedFrequency,

      @UI.lineItem:       [{ position: 60 }]
      @UI.selectionField: [{ position: 30 }]
      InterfaceOwner,

      @UI.lineItem:       [{ position: 70 }]
      @UI.selectionField: [{ position: 40 }]
      IsActive
}
