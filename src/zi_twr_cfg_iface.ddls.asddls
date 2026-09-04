@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Interface Catalog (anchor)'
@Metadata.ignorePropagatedAnnotations: true

// One row per monitored interface. Ships empty - populated via SE16N/SM30
// once real interface names + log techniques are confirmed
// (00_context_and_decisions.md §5 item 3 / §7). Every field is a config
// value this repo defines itself (new custom table, ZTWR_CFG_IFACE) - no
// field-name guessing risk the way reading an existing SAP table carries.
//
// T3 (BUILD_ISSUES_LOG.md): first version had no per-element @EndUserText.
// label, so Fiori fell back to each field's underlying DATA ELEMENT's own
// label - which on this system turned out confusing/wrong (CHAR20/CHAR40
// showed literally as "Char20"/"Char", and IFACE_OWNER's original rollname
// BNAME resolved to "Branching name", not the SAP username label assumed -
// BNAME is safe to SELECT raw from an existing table (Stage 2 proved that),
// but is NOT safe to reuse as a rollname on an unrelated new table; swapped
// to CHAR40 (src/ztwr_cfg_iface.tabl.xml) since this field is free text
// ("SAP Basis Team"), not a real SU01 username anyway. Every element below
// now carries its own explicit @EndUserText.label, which wins over any
// inherited data-element label regardless of the mechanism that produced it.

define view entity ZI_TWR_CFG_IFACE
  as select from ztwr_cfg_iface
{
      @EndUserText.label: 'Interface ID'
  key iface_id       as InterfaceId,

      @EndUserText.label: 'Interface Name'
      iface_name      as InterfaceName,

      @EndUserText.label: 'Log Technique'
      log_technique   as LogTechnique,

      @EndUserText.label: 'Log Object'
      log_object      as LogObject,

      @EndUserText.label: 'Expected Frequency'
      expected_freq   as ExpectedFrequency,

      @EndUserText.label: 'Owner'
      iface_owner     as InterfaceOwner,

      @EndUserText.label: 'Active'
      is_active       as IsActive
}
