"! <p class="shorttext synchronized">VS Tower - Short Dump (ST22) query provider</p>
"!
"! The one and only ABAP class in VS-Tower. Table SNAP (ABAP runtime errors)
"! is a clustered store - it cannot be read with Open SQL / SE16N / a plain
"! CDS view, so the Short Dumps cards are backed by a RAP custom entity
"! (ZC_TWR_SHORTDUMP) whose query is implemented here.
"!
"! Read-only. Returns one row per dump for a fixed 30-day window (the UI's
"! date-range + user filter narrows it client-side).
"! Header fields (when / who / server / retained) come straight from SNAP;
"! RuntimeError / ShortText / AbapProgram are a best-effort enrichment from
"! FM RS_ST22_GET_DUMPS, fully guarded - blank if that FM's interface differs
"! on this release (see docs/BUILD_ISSUES_LOG.md).
CLASS zcl_twr_shortdump_qry DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_rap_query_provider.

  PRIVATE SECTION.
    CONSTANTS:
      c_default_days TYPE i VALUE 30,
      c_max_rows     TYPE i VALUE 5000.

    TYPES ty_result TYPE STANDARD TABLE OF zc_twr_shortdump WITH EMPTY KEY.

    METHODS build_list
      RETURNING VALUE(rt_result) TYPE ty_result.

    METHODS enrich_from_st22
      CHANGING ct_result TYPE ty_result.

    METHODS pick_component
      IMPORTING is_src        TYPE any
                iv_candidates TYPE string
      CHANGING  cv_target     TYPE any.
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

    " Fixed 30-day window. The UI's date-range picker narrows this further
    " client-side; a range wider than 30 days simply shows what's loaded
    " (deep history would be a later change - keep the query trivially safe).
    DATA(lv_today) = cl_abap_context_info=>get_system_date( ).
    DATA(lv_from)  = CONV d( lv_today - c_default_days ).
    DATA(lv_yday)  = CONV d( lv_today - 1 ).

    " One logical dump = one distinct (date, time, user, host). SNAP stores
    " each dump as many SEQNO chunks that all repeat these header fields.
    " VERIFY-ME (T-style): SNAP fields DATUM / UZEIT / UNAME / AHOST / XHOLD.
    " The whole read is wrapped - any failure leaves an empty card, not a 500.
    TRY.
        SELECT DISTINCT
               datum AS dump_date,
               uzeit AS dump_time,
               uname AS dump_user,
               ahost AS dump_host,
               xhold AS retained
          FROM snap
          WHERE datum >= @lv_from
          ORDER BY dump_date DESCENDING, dump_time DESCENDING
          INTO TABLE @DATA(lt_snap)
          UP TO @c_max_rows ROWS.
      CATCH cx_root.
        CLEAR rt_result.
        RETURN.
    ENDTRY.

    IF lt_snap IS INITIAL.
      RETURN.
    ENDIF.

    " dumps per user across the window (shown as context, not used for
    " criticality any more - it made a single recurring job read as 300 reds)
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

    SORT rt_result BY dumptimestamp DESCENDING.

    enrich_from_st22( CHANGING ct_result = rt_result ).

  ENDMETHOD.


  METHOD enrich_from_st22.
    " Best-effort. RS_ST22_GET_DUMPS is what ST22 itself calls to build its
    " list. Called dynamically (variable FM name) so a missing FM or a
    " different interface cannot block activation - the columns just stay
    " blank and the cards work off the SNAP header fields. If they ARE blank
    " after activation, the SE37 signature of RS_ST22_GET_DUMPS maps straight
    " onto this method (Import: date range; Tables: the dump list).
    IF ct_result IS INITIAL.
      RETURN.
    ENDIF.

    TRY.
        DATA lt_snap TYPE STANDARD TABLE OF snap.
        DATA(lv_to)   = cl_abap_context_info=>get_system_date( ).
        DATA(lv_from) = CONV d( lv_to - c_default_days ).

        " kind: 'E' exporting, 'T' tables (abap_func_parmbind-kind values).
        " Literals, not the type-pool constants, so a constant-name change
        " can never break activation - only the runtime call, which is caught.
        DATA lt_par TYPE abap_func_parmbind_tab.
        DATA lt_exc TYPE abap_func_excpbind_tab.
        lt_par = VALUE #(
          ( name = 'P_DAYFR' kind = 'E' value = REF #( lv_from ) )
          ( name = 'P_DAYTO' kind = 'E' value = REF #( lv_to ) )
          ( name = 'P_LIST'  kind = 'T' value = REF #( lt_snap ) ) ).
        lt_exc = VALUE #( ( name = 'OTHERS' value = 1 ) ).

        DATA lv_fm TYPE c LENGTH 30.
        lv_fm = 'RS_ST22_GET_DUMPS'.
        CALL FUNCTION lv_fm
          PARAMETER-TABLE lt_par
          EXCEPTION-TABLE lt_exc.

        IF sy-subrc <> 0 OR lt_snap IS INITIAL.
          RETURN.
        ENDIF.

        " index the FM's rows by date+time+user so the merge is not O(n*m)
        TYPES: BEGIN OF ty_idx,
                 k    TYPE string,
                 err  TYPE string,
                 txt  TYPE string,
                 prog TYPE string,
               END OF ty_idx.
        DATA lt_idx TYPE HASHED TABLE OF ty_idx WITH UNIQUE KEY k.
        DATA lv_err  TYPE string.
        DATA lv_txt  TYPE string.
        DATA lv_prog TYPE string.

        LOOP AT lt_snap ASSIGNING FIELD-SYMBOL(<f>).
          CLEAR: lv_err, lv_txt, lv_prog.
          pick_component( EXPORTING is_src = <f>
                                    iv_candidates = 'ERROR_ID SNAPID ERRID RUNTIME_ERROR'
                          CHANGING  cv_target = lv_err ).
          pick_component( EXPORTING is_src = <f>
                                    iv_candidates = 'SHORT_TEXT SNAPTID DUMPTEXT TEXT'
                          CHANGING  cv_target = lv_txt ).
          pick_component( EXPORTING is_src = <f>
                                    iv_candidates = 'PROG PROGRAM ABAP_PROG RSNAP_PROG'
                          CHANGING  cv_target = lv_prog ).
          IF lv_err IS INITIAL AND lv_txt IS INITIAL.
            CONTINUE.
          ENDIF.
          DATA(lv_key) = |{ <f>-datum DATE = RAW }{ <f>-uzeit TIME = RAW }{ <f>-uname }|.
          INSERT VALUE #( k = lv_key err = lv_err txt = lv_txt prog = lv_prog )
                 INTO TABLE lt_idx.
        ENDLOOP.

        LOOP AT ct_result ASSIGNING FIELD-SYMBOL(<r>).
          READ TABLE lt_idx INTO DATA(ls_i) WITH KEY k = |{ <r>-dumpid }|.
          IF sy-subrc = 0.
            <r>-runtimeerror = ls_i-err.
            <r>-shorttext    = ls_i-txt.
            <r>-abapprogram  = ls_i-prog.
          ENDIF.
        ENDLOOP.

      CATCH cx_root.
        RETURN.
    ENDTRY.
  ENDMETHOD.


  METHOD pick_component.
    SPLIT iv_candidates AT ` ` INTO TABLE DATA(lt_names).
    LOOP AT lt_names INTO DATA(lv_name).
      ASSIGN COMPONENT lv_name OF STRUCTURE is_src TO FIELD-SYMBOL(<f>).
      IF sy-subrc = 0 AND <f> IS NOT INITIAL.
        cv_target = <f>.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
