@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Transport Request (query)'
@Metadata.allowExtensions: true
@UI.headerInfo: {
  typeName: 'Transport Request',
  typeNamePlural: 'Transport Requests'
}

// Plain "select from" query view - same shape as Stages 1-3 (all proven
// green).

define view entity ZC_TWR_TRANSPORT
  as select from ZI_TWR_TRANSPORT
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key TransportRequest,

      @UI.lineItem:       [{ position: 20 }]
      @UI.selectionField: [{ position: 20 }]
      RequestType,

      @UI.lineItem: [{ position: 30, criticality: 'StatusCriticality' }]
      @UI.selectionField: [{ position: 30 }]
      RequestStatus,

      StatusCriticality,

      @UI.lineItem:       [{ position: 40 }]
      @UI.selectionField: [{ position: 40 }]
      Owner,

      @UI.lineItem:       [{ position: 50 }]
      @UI.identification: [{ position: 50 }]
      ChangedOnDate,

      @UI.lineItem:       [{ position: 60 }]
      @UI.identification: [{ position: 60 }]
      ChangedOnTime
}
