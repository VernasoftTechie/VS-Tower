"! <p class="shorttext synchronized">VS Tower - Failed Authorization query provider</p>
"!
"! Second (and last planned) ABAP class in VS-Tower. The Security Audit Log
"! (SM19/SM20) is not readable by any CDS, so the "Auth Failed Attempts"
"! card is a RAP custom entity (ZC_TWR_AUTH_FAIL) whose query is here.
"!
"! Read-only, best-effort. A dynamic CALL to the SAL reader FM
"! RSAU_READ_LOG, wrapped so a missing FM / different interface / SAL not
"! active can only ever produce an empty card - never an activation error
"! or a 500. If the card stays empty, the SAL is off (SM19) or not readable
"! by the dashboard user, or the FM signature differs on this release (send
"! the SE37 Import/Tables tabs - see docs/BUILD_ISSUES_LOG.md).
CLASS zcl_twr_authfail_qry DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_rap_query_provider.

  PRIVATE SECTION.
    CONSTANTS:
      c_default_days TYPE i VALUE 14,
      c_max_rows     TYPE i VALUE 2000.

    TYPES ty_result TYPE STANDARD TABLE OF zc_twr_auth_fail WITH EMPTY KEY.

    METHODS build_list
      RETURNING VALUE(rt_result) TYPE ty_result.

    METHODS pick_component
      IMPORTING is_src        TYPE any
                iv_candidates TYPE string
      CHANGING  cv_target     TYPE any.
ENDCLASS.


CLASS zcl_twr_authfail_qry IMPLEMENTATION.

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
        DATA(lv_to)   = cl_abap_context_info=>get_system_date( ).
        DATA(lv_from) = CONV d( lv_to - c_default_days ).

        " Generic table for whatever the SAL reader returns - RTTI-free
        " mapping via pick_component below, so the row structure does not
        " have to be known at compile time.
        DATA lr_log TYPE REF TO data.
        FIELD-SYMBOLS <log> TYPE STANDARD TABLE.
        CREATE DATA lr_log TYPE STANDARD TABLE OF ('RSAUENTR2').
        ASSIGN lr_log->* TO <log>.
        IF <log> IS NOT ASSIGNED.
          RETURN.
        ENDIF.

        DATA lt_par TYPE abap_func_parmbind_tab.
        DATA lt_exc TYPE abap_func_excpbind_tab.
        " IF_* exporting (we pass), ET_LOG importing (FM returns). If any
        " param name is wrong the dynamic call raises - caught below.
        lt_par = VALUE #(
          ( name = 'IF_DATE_FROM' kind = 'E' value = REF #( lv_from ) )
          ( name = 'IF_DATE_TO'   kind = 'E' value = REF #( lv_to ) )
          ( name = 'ET_LOG'       kind = 'I' value = lr_log ) ).
        lt_exc = VALUE #( ( name = 'OTHERS' value = 1 ) ).

        DATA lv_fm TYPE c LENGTH 30.
        lv_fm = 'RSAU_READ_LOG'.
        CALL FUNCTION lv_fm
          PARAMETER-TABLE lt_par
          EXCEPTION-TABLE lt_exc.

        IF sy-subrc <> 0 OR <log> IS INITIAL.
          RETURN.
        ENDIF.

        DATA lv_err  TYPE string.
        DATA lv_user TYPE string.
        DATA lv_term TYPE string.
        DATA lv_tcod TYPE string.
        DATA lv_txt  TYPE string.
        DATA lv_dat  TYPE string.
        DATA lv_tim  TYPE string.
        DATA lv_cls  TYPE string.
        DATA lv_seq  TYPE i.

        LOOP AT <log> ASSIGNING FIELD-SYMBOL(<e>).
          CLEAR: lv_err, lv_user, lv_term, lv_tcod, lv_txt, lv_dat, lv_tim, lv_cls.
          pick_component( EXPORTING is_src = <e>
                          iv_candidates = 'SLGMESSAGE MESSAGE MSGTX TEXT SLGTEXT'
                          CHANGING cv_target = lv_txt ).
          pick_component( EXPORTING is_src = <e>
                          iv_candidates = 'SLGUSER LOGUSER USER UNAME BNAME'
                          CHANGING cv_target = lv_user ).
          pick_component( EXPORTING is_src = <e>
                          iv_candidates = 'SLGTCODE TCODE'
                          CHANGING cv_target = lv_tcod ).
          pick_component( EXPORTING is_src = <e>
                          iv_candidates = 'SLGTERM TERMINAL AREA'
                          CHANGING cv_target = lv_term ).
          pick_component( EXPORTING is_src = <e>
                          iv_candidates = 'SLGDATE LOGDATE DATE ALDATE'
                          CHANGING cv_target = lv_dat ).
          pick_component( EXPORTING is_src = <e>
                          iv_candidates = 'SLGTIME LOGTIME TIME ALTIME'
                          CHANGING cv_target = lv_tim ).
          pick_component( EXPORTING is_src = <e>
                          iv_candidates = 'SLGSUBCLS SUBCLASS CLASS SLGCLASS'
                          CHANGING cv_target = lv_cls ).
          pick_component( EXPORTING is_src = <e>
                          iv_candidates = 'SLGMSGID MSGID SLGID'
                          CHANGING cv_target = lv_err ).

          " keep only rows that look authorization-related
          DATA(lv_probe) = to_upper( lv_txt && ` ` && lv_cls && ` ` && lv_err ).
          DATA(lv_is_au) = xsdbool( to_upper( lv_err ) CP 'AU*' ).
          IF lv_probe NS 'AUTHORI' AND lv_probe NS 'NOT AUTHORIZED'
             AND lv_probe NS 'S_TCODE' AND lv_is_au = abap_false.
            CONTINUE.
          ENDIF.

          lv_seq = lv_seq + 1.
          DATA(lv_ts) = lv_dat && lv_tim.

          DATA(ls_r) = VALUE zc_twr_auth_fail(
            failid         = |{ lv_ts }-{ lv_user }-{ lv_seq }|
            eventtimestamp = lv_ts
            faildate       = lv_dat
            failuser       = lv_user
            failtcode      = lv_tcod
            failtext       = lv_txt
            failterminal   = lv_term
            auditclass     = lv_cls
            criticality    = 2
            severitytext   = 'Warning' ).

          APPEND ls_r TO rt_result.
          IF lines( rt_result ) >= c_max_rows.
            EXIT.
          ENDIF.
        ENDLOOP.

        SORT rt_result BY eventtimestamp DESCENDING.

      CATCH cx_root.
        CLEAR rt_result.
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
