@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - BGJob Latest Run (helper)'
@Metadata.ignorePropagatedAnnotations: true

// Helper aggregate, not exposed to the service directly - only consumed by
// ZI_TWR_BGJOB_HEALTH's self-join below. The highest JobCount per JobName =
// that job's most recent run: JOBCOUNT is TBTCO's own fixed-width,
// zero-padded, incrementing run-sequence number per job name, so MAX() on
// it sorts correctly as a plain string comparison (no date-arithmetic risk,
// same reasoning as why the T2 fix's YYYYMMDD text sorts correctly too).
// Same aggregation shape already proven four times over (ZC_TWR_DQ_SUMMARY /
// _SEC_SUMMARY / _BGJOB_SUMMARY / _TRANSPORT_SUMMARY / _PAYROLL_AREA): plain
// GROUP BY, no @Analytics.query, key on the grouping dimension.
// LatestJobCount deliberately NOT cast - keeping its type identical to
// ZI_TWR_BGJOB.JobCount (uncast) so the equality join in ZI_TWR_BGJOB_HEALTH
// compares two values of the same natural type.

define view entity ZI_TWR_BGJOB_LATEST
  as select from ZI_TWR_BGJOB
{
  key JobName,
      max( JobCount ) as LatestJobCount
}
group by
  JobName
