@EndUserText.label: 'Tower - Failed Authorization Attempts'
@ObjectModel.query.implementedBy: 'ABAP:ZCL_TWR_AUTHFAIL_QRY'
@UI.headerInfo: { typeName: 'Auth Failure', typeNamePlural: 'Auth Failures' }

// Recent failed-authorization / failed-transaction-start events for the
// Security cards in the Live section - "who is hitting walls they should
// not be, and when". Source is the Security Audit Log (SM19 / SM20), which
// no CDS can read - so this is a RAP custom entity + query class, the
// SECOND (and last planned) ABAP class in the repo, same guarded pattern
// as ZC_TWR_SHORTDUMP: a dynamic CALL to the SAL reader FM, wrapped so a
// missing FM / wrong interface / SAL-not-active yields an empty card, never
// an activation failure or a 500.
//
// If this card stays empty, the SAL is either not active (SM19) or not
// readable by the dashboard user - see docs/BUILD_ISSUES_LOG.md.

define custom entity ZC_TWR_AUTH_FAIL
{
      @EndUserText.label: 'Event'
  key FailId          : abap.char(80);

      @EndUserText.label: 'Severity'
      SeverityText    : abap.char(12);

      @UI.lineItem: [{ position: 10 }]
      @EndUserText.label: 'When'
      EventTimestamp  : abap.char(14);

      @EndUserText.label: 'Date (YYYYMMDD)'
      FailDate        : abap.char(8);

      @UI.lineItem: [{ position: 20 }]
      @EndUserText.label: 'User'
      FailUser        : abap.char(12);

      @UI.lineItem: [{ position: 30 }]
      @EndUserText.label: 'Transaction'
      FailTCode       : abap.char(20);

      @UI.lineItem: [{ position: 40 }]
      @EndUserText.label: 'What Was Blocked'
      FailText        : abap.char(150);

      @UI.lineItem: [{ position: 50 }]
      @EndUserText.label: 'Terminal / Host'
      FailTerminal    : abap.char(64);

      @EndUserText.label: 'Audit Class'
      AuditClass      : abap.char(20);

      @EndUserText.label: 'Criticality'
      Criticality     : abap.int4;
}
