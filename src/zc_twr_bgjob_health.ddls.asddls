@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Job Health (query)'
@Metadata.allowExtensions: true
@UI.headerInfo: {
  typeName: 'Job Health',
  typeNamePlural: 'Background Job Health'
}

// Primary Background Jobs Monitor tile - one row per job name (latest run
// only), pending or failed only. ZI_TWR_BGJOB_HEALTH already filters out
// clean finishes and duplicate historical runs, so this is a plain
// "select from" with no extra logic, same shape as every consumption view
// in this repo. Full run history remains available via ZC_TWR_BGJOB
// (exposed as BackgroundJobHistory) for drill-down.

define view entity ZC_TWR_BGJOB_HEALTH
  as select from ZI_TWR_BGJOB_HEALTH
{
      @UI.lineItem:       [{ position: 10 }]
      @UI.selectionField: [{ position: 10 }]
  key JobName,

      @UI.lineItem:       [{ position: 20 }]
  key JobCount,

      @UI.lineItem: [{ position: 30, criticality: 'StatusCriticality' }]
      @UI.selectionField: [{ position: 20 }]
      Status,

      StatusCriticality,

      @UI.lineItem:       [{ position: 40 }]
      @UI.identification: [{ position: 40 }]
      StartDate,

      @UI.lineItem:       [{ position: 50 }]
      @UI.identification: [{ position: 50 }]
      StartTime,

      @UI.lineItem:       [{ position: 60 }]
      @UI.identification: [{ position: 60 }]
      EndDate,

      @UI.lineItem:       [{ position: 70 }]
      @UI.identification: [{ position: 70 }]
      EndTime
}
