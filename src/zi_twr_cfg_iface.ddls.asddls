@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Tower - Interface Catalog (anchor)'
@Metadata.ignorePropagatedAnnotations: true

// One row per monitored interface. Ships empty - populated via SE16N/SM30
// once real interface names + log techniques are confirmed
// (00_context_and_decisions.md §5 item 3 / §7). Every field is a config
// value this repo defines itself (new custom table, ZTWR_CFG_IFACE) - no
// field-name guessing risk the way reading an existing SAP table carries.
// IFACE_OWNER reuses BNAME (proven to render raw with no conversion exit,
// same data element as USR02-BNAME in Stage 2).

define view entity ZI_TWR_CFG_IFACE
  as select from ztwr_cfg_iface
{
  key iface_id       as InterfaceId,
      iface_name      as InterfaceName,
      log_technique   as LogTechnique,
      log_object      as LogObject,
      expected_freq   as ExpectedFrequency,
      iface_owner     as InterfaceOwner,
      is_active       as IsActive
}
