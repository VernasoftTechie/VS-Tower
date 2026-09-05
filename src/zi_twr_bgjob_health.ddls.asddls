@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Background Job Health'
@Metadata.ignorePropagatedAnnotations: true

// One row per job NAME - only its most recent run (self-join to
// ZI_TWR_BGJOB_LATEST's max(JobCount) per name), and only where that latest
// run is NOT a clean finish (Status <> 'F'). This is what the dashboard
// shows for Background Jobs - not a raw TBTCO dump. Full run history stays
// available separately, unchanged, via ZI_TWR_BGJOB / ZC_TWR_BGJOB.
//
// Status meaning used here: F = finished (excluded by the where clause),
// A = aborted/cancelled (shown as error via StatusCriticality), P/S/Y/R =
// scheduled/released/ready/running (shown as pending). F/A are confirmed
// (already in production via ZI_TWR_BGJOB's StatusCriticality); P/S/Y/R are
// not yet independently verified on this system. If any of those turn out
// to mean something else, only the *StatusCriticality* colour is affected -
// the where clause only tests <> 'F', so nothing pending is ever hidden
// regardless of which of P/S/Y/R it actually is.

define view entity ZI_TWR_BGJOB_HEALTH
  as select from ZI_TWR_BGJOB as J
    inner join ZI_TWR_BGJOB_LATEST as L
      on  L.JobName = J.JobName
      and L.LatestJobCount = J.JobCount
{
  key J.JobName          as JobName,
  key J.JobCount         as JobCount,
      J.Status            as Status,
      J.StatusCriticality as StatusCriticality,
      J.Owner             as Owner,
      J.StartDate         as StartDate,
      J.StartTime         as StartTime,
      J.EndDate           as EndDate,
      J.EndTime           as EndTime
}
where J.Status <> 'F'
