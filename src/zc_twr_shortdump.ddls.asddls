@EndUserText.label: 'Tower - Short Dumps (ST22)'
@ObjectModel.query.implementedBy: 'ABAP:ZCL_TWR_SHORTDUMP_QRY'
@UI.headerInfo: { typeName: 'Short Dump', typeNamePlural: 'Short Dumps' }

// ABAP short dumps (table SNAP) from the last ~30 days, for the Short Dumps
// cards in the Live section. SNAP is a clustered runtime-error store - it
// cannot be read with Open SQL / SE16N / a plain CDS view (client ask
// 2026-09-08). This is the ONE custom entity + query class in an otherwise
// class-free repo (decision D1 relaxed for this single case).
//
// The query class:
//   - reads SNAP's transparent header fields (when / who / server / retained)
//     for a fixed 30-day window - the UI narrows it client-side
//   - best-effort enriches RuntimeError / ShortText / AbapProgram from the
//     ST22 reader FM (RS_ST22_GET_DUMPS) - fully guarded, blank if the FM
//     interface differs on this release (see docs/BUILD_ISSUES_LOG.md)
//   - criticality: retained in ST22 -> Critical; raised in last 24h ->
//     Warning; otherwise Info
//
// @UI.lineItem is here only so the service-binding preview shows columns -
// the freestyle app reads the raw entity and ignores all @UI. Annotations
// sit BEFORE the key / field name (custom-entity rule, BUILD_ISSUES_LOG #26/#28).

define custom entity ZC_TWR_SHORTDUMP
{
      @EndUserText.label: 'Dump'
  key DumpId          : abap.char(72);

      @UI.lineItem: [{ position: 10 }]
      @EndUserText.label: 'Severity'
      SeverityText    : abap.char(12);

      @UI.lineItem: [{ position: 20 }]
      @EndUserText.label: 'When'
      DumpTimestamp   : abap.char(14);

      @EndUserText.label: 'Date (YYYYMMDD)'
      DumpDate        : abap.char(8);

      @EndUserText.label: 'Time (HHMMSS)'
      DumpTime        : abap.char(6);

      @UI.lineItem: [{ position: 30 }]
      @EndUserText.label: 'User'
      DumpUser        : abap.char(12);

      @UI.lineItem: [{ position: 40 }]
      @EndUserText.label: 'Runtime Error'
      RuntimeError    : abap.char(40);

      @UI.lineItem: [{ position: 50 }]
      @EndUserText.label: 'Short Text'
      ShortText       : abap.char(128);

      @UI.lineItem: [{ position: 60 }]
      @EndUserText.label: 'Program'
      AbapProgram     : abap.char(40);

      @UI.lineItem: [{ position: 70 }]
      @EndUserText.label: 'App Server'
      DumpHost        : abap.char(32);

      @UI.lineItem: [{ position: 80 }]
      @EndUserText.label: 'Why Flagged'
      FlagReason      : abap.char(60);

      @UI.lineItem: [{ position: 90 }]
      @EndUserText.label: 'Retained'
      IsRetained      : abap.char(1);

      @EndUserText.label: 'Dumps by User'
      DumpsByUser     : abap.int4;

      @EndUserText.label: 'Criticality'
      Criticality     : abap.int4;
}
