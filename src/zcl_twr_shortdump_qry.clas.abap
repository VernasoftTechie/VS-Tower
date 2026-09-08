"! <p class="shorttext synchronized">VS Tower - Short Dump (ST22) query provider</p>
"!
"! The one and only ABAP class in VS-Tower. Table SNAP (ABAP runtime errors)
"! is a clustered store - it cannot be read with Open SQL / SE16N / a plain
"! CDS view, so the "System Stability" card is backed by a RAP custom entity
"! (ZC_TWR_SHORTDUMP) whose query is implemented here.
"!
"! Read-only. Returns one row per dump for the last 7 days with a derived
"! criticality (Retained / Repeated -> Critical, Recent -> Warning, else
"! Info). Runtime-error name / short text / program need the ST22 decompress
"! API and are a documented follow-up - see docs/BUILD_ISSUES_LOG.md.
CLASS zcl_twr_shortdump_qry DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_rap_query_provider.

  PRIVATE SECTION.
    CONSTANTS:
      c_lookback_days    TYPE i VALUE 7,
      c_repeat_threshold TYPE i VALUE 3,
      c_max_rows         TYPE i VALUE 300.

    TYPES ty_result TYPE STANDARD TABLE OF zc_twr_shortdump WITH EMPTY KEY.

    METHODS build_list
      RETURNING VALUE(rt_result) TYPE ty_result.
ENDCLASS.


CLASS zcl_twr_shortdump_qry IMPLEMENTATION.

  METHOD if_rap_query_provider~select.

    DATA(lt_all) = build_list( ).

    IF io_request->is_total_numb_of_rec_requested( ) = abap_true.
      io_response->set_total_number_of_records( lines( lt_all ) ).
    ENDIF.

    IF io_request->is_data_requested( ) = abap_false.
      RETURN.
    ENDIF.

    DATA(lo_paging) = io_request->get_paging( ).
    DATA(lv_offset) = lo_paging->get_offset( ).
    DATA(lv_size)   = lo_paging->get_page_size( ).

    DATA lt_page TYPE ty_result.
    IF lv_size = if_rap_query_paging=>page_size_unlimited OR lv_size <= 0.
      lt_page = lt_all.
    ELSE.
      DATA(lv_lo) = lv_offset + 1.
      DATA(lv_hi) = lv_offset + lv_size.
      LOOP AT lt_all INTO DATA(ls_row) FROM lv_lo TO lv_hi.
        APPEND ls_row TO lt_page.
      ENDLOOP.
    ENDIF.

    io_response->set_data( lt_page ).

  ENDMETHOD.


  METHOD build_list.

    TRY.
        DATA(lv_today) = cl_abap_context_info=>get_system_date( ).
        DATA(lv_from)  = CONV d( lv_today - c_lookback_days ).
        DATA(lv_yday)  = CONV d( lv_today - 1 ).

        " One logical dump = one distinct (date, time, user, host). SNAP
        " stores each dump as many SEQNO chunks that all repeat these header
        " fields, so DISTINCT collapses a dump to a single row.
        "
        " VERIFY-ME (T5-style): SNAP field names DATUM / UZEIT / UNAME /
        " AHOST / XHOLD. If activation flags one it is a straight rename
        " here - nothing else depends on the physical names. The whole read
        " is wrapped so any failure (incl. missing SELECT authorisation)
        " leaves the card empty instead of dumping the OData call.
        SELECT DISTINCT
               datum AS dump_date,
               uzeit AS dump_time,
               uname AS dump_user,
               ahost AS dump_host,
               xhold AS retained
          FROM snap
          WHERE datum >= @lv_from
          INTO TABLE @DATA(lt_snap).
      CATCH cx_root.
        CLEAR rt_result.
        RETURN.
    ENDTRY.

    IF lt_snap IS INITIAL.
      RETURN.
    ENDIF.

    " Dumps per user across the whole window - a burst from one ID escalates.
    TYPES: BEGIN OF ty_cnt,
             dump_user TYPE c LENGTH 12,
             cnt       TYPE i,
           END OF ty_cnt.
    DATA lt_cnt TYPE HASHED TABLE OF ty_cnt WITH UNIQUE KEY dump_user.

    LOOP AT lt_snap ASSIGNING FIELD-SYMBOL(<s>).
      READ TABLE lt_cnt ASSIGNING FIELD-SYMBOL(<c>) WITH KEY dump_user = <s>-dump_user.
      IF sy-subrc <> 0.
        INSERT VALUE #( dump_user = <s>-dump_user cnt = 0 ) INTO TABLE lt_cnt ASSIGNING <c>.
      ENDIF.
      <c>-cnt = <c>-cnt + 1.
    ENDLOOP.

    DATA lv_cnt TYPE i.

    LOOP AT lt_snap ASSIGNING <s>.

      CLEAR lv_cnt.
      READ TABLE lt_cnt INTO DATA(ls_c) WITH KEY dump_user = <s>-dump_user.
      IF sy-subrc = 0.
        lv_cnt = ls_c-cnt.
      ENDIF.

      DATA(ls_r) = VALUE zc_twr_shortdump(
        dumpid        = |{ <s>-dump_date DATE = RAW }{ <s>-dump_time TIME = RAW }{ <s>-dump_user }|
        dumpdate      = <s>-dump_date
        dumptime      = <s>-dump_time
        dumptimestamp = |{ <s>-dump_date DATE = RAW }{ <s>-dump_time TIME = RAW }|
        dumpuser      = <s>-dump_user
        dumphost      = <s>-dump_host
        isretained    = <s>-retained
        dumpsbyuser   = lv_cnt ).

      IF <s>-retained = 'X'.
        ls_r-criticality  = 1.
        ls_r-severitytext = 'Critical'.
        ls_r-flagreason   = 'Retained in ST22 by an administrator'.
      ELSEIF lv_cnt >= c_repeat_threshold.
        ls_r-criticality  = 1.
        ls_r-severitytext = 'Critical'.
        ls_r-flagreason   = |{ lv_cnt } dumps from this user in { c_lookback_days } days|.
      ELSEIF <s>-dump_date >= lv_yday.
        ls_r-criticality  = 2.
        ls_r-severitytext = 'Warning'.
        ls_r-flagreason   = 'Raised in the last 24 hours'.
      ELSE.
        ls_r-criticality  = 3.
        ls_r-severitytext = 'Info'.
        ls_r-flagreason   = 'Older than 24 hours'.
      ENDIF.

      APPEND ls_r TO rt_result.

    ENDLOOP.

    SORT rt_result BY criticality ASCENDING dumptimestamp DESCENDING.

    IF lines( rt_result ) > c_max_rows.
      DATA(lv_cut) = c_max_rows + 1.
      DELETE rt_result FROM lv_cut.
    ENDIF.

  ENDMETHOD.

ENDCLASS.
