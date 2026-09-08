@EndUserText.label: 'Tower - Short Dumps (ST22)'
@ObjectModel.query.implementedBy: 'ABAP:ZCL_TWR_SHORTDUMP_QRY'

// ABAP short dumps (table SNAP) from the last 7 days, for the "System
// Stability" card. SNAP is a clustered runtime-error store - it cannot be
// read with Open SQL / SE16N / a plain CDS view (client ask 2026-09-08,
// confirmed the "You cannot display SNAP with the standard tools" message
// is expected). This is the ONE custom entity + query class in an
// otherwise class-free repo (decision D1 relaxed for this single case).
//
// The query class reads SNAP's transparent header fields (when / who /
// which server / retained flag) and derives a criticality from three
// signals it CAN see without decompressing the dump payload:
//   - Retained  : an admin ticked "keep" in ST22  -> Critical
//   - Repeated  : 3+ dumps from the same user in the window -> Critical
//   - Recent    : raised in the last 24h -> Warning
//   - otherwise -> Info
// Runtime-error name / short text / program need the ST22 decompress API
// and are a documented follow-up (see docs/BUILD_ISSUES_LOG.md).

define custom entity ZC_TWR_SHORTDUMP
{
      @UI.lineItem: [{ position: 5, criticality: 'Criticality' }]
      @EndUserText.label: 'Severity'
      SeverityText    : abap.char(12);

  key @EndUserText.label: 'Dump'
      DumpId          : abap.char(72);

      @UI.lineItem: [{ position: 10 }]
      @EndUserText.label: 'When'
      DumpTimestamp   : abap.char(14);

      @EndUserText.label: 'Date (YYYYMMDD)'
      DumpDate        : abap.char(8);

      @EndUserText.label: 'Time (HHMMSS)'
      DumpTime        : abap.char(6);

      @UI.lineItem: [{ position: 20 }]
      @EndUserText.label: 'User'
      DumpUser        : abap.char(12);

      @UI.lineItem: [{ position: 30 }]
      @EndUserText.label: 'App Server'
      DumpHost        : abap.char(32);

      @UI.lineItem: [{ position: 40 }]
      @EndUserText.label: 'Why Flagged'
      FlagReason      : abap.char(60);

      @UI.lineItem: [{ position: 50 }]
      @EndUserText.label: 'Retained'
      IsRetained      : abap.char(1);

      @EndUserText.label: 'Dumps by User (window)'
      DumpsByUser     : abap.int4;

      @EndUserText.label: 'Criticality'
      Criticality     : abap.int4;
}
