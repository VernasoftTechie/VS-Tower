sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter",
  "sap/m/Dialog",
  "sap/m/Button",
  "sap/ui/core/HTML"
], function (Controller, JSONModel, Filter, FilterOperator, Sorter, Dialog, Button, HTML) {
  "use strict";

  // Live section poll interval, confirmed by the client after a feasibility
  // review - see ui/README.md "Live refresh". The Workflow and Workforce
  // sections do NOT poll (Workflow is date-range analytical, Workforce
  // barely changes) - they load once and refresh on demand.
  var REFRESH_MS = 5000;

  // Fixed-order categorical palette (dataviz discipline: colour follows the
  // entity, never its position - _collectCards sorts every chart's data by
  // name first, so the same category keeps the same colour every refresh).
  var CAT = ["#0a6ed1", "#e9730c", "#925ace", "#147575", "#bb0044", "#6a6d70", "#c26b00", "#3b7a3b"];

  // Small fixed-code label map. Anything client-specific or high-cardinality
  // (company code, cost centre, ...) gets a real text view instead - see
  // docs/04_fiori_ui_design.md.
  var TR_STATUS_LABEL = { D: "Modifiable", R: "Released" };

  // R3TR repository object types -> plain description. These 4-char codes are
  // utterly stable across SAP releases, so a fixed map is safer than a
  // text-table join (no field-name risk, no extra CDS). Falls back to the
  // raw code for anything not listed.
  var OBJ_TYPE_TEXT = {
    PROG: "Program", REPS: "Program Source", CLAS: "Class", INTF: "Interface",
    FUGR: "Function Group", FUGS: "Function Group", FUNC: "Function Module",
    METH: "Method", TABL: "Table / Structure", VIEW: "Database View",
    DTEL: "Data Element", DOMA: "Domain", TTYP: "Table Type", SHLP: "Search Help",
    ENQU: "Lock Object", INDX: "Table Index", SQLT: "DB Table (technical)",
    MSAG: "Message Class", TRAN: "Transaction", PARA: "Parameter ID",
    DEVC: "Package", DDLS: "CDS View", DDLX: "Metadata Extension",
    DCLS: "Access Control (DCL)", SRVD: "Service Definition", SRVB: "Service Binding",
    BDEF: "Behavior Definition", NROB: "Number Range Object", AUTH: "Auth. Field",
    SUSO: "Authorization Object", SUSC: "Auth. Object Class", SICF: "ICF Service Node",
    IWSV: "OData Service (GW)", IWSG: "OData Service Group", IWMO: "OData Model",
    IWVB: "OData Vocabulary", IWPR: "OData Project", IARP: "OData Reg. (project)",
    WDYN: "Web Dynpro Comp.", WDYA: "Web Dynpro Appl.", WAPA: "BSP Application",
    SMTG: "SmartForms Text", SSFO: "Smart Form", FORM: "SAPscript Form",
    STYL: "SAPscript Style", SOBJ: "Business Object", SCP1: "Cross-App Component",
    XSLT: "Transformation", TYPE: "Type Pool", G4BA: "OData V4 Binding",
    G4BS: "OData V4 Service", DRUL: "Derivation Rule", ECAT: "eCATT Test"
  };

  return Controller.extend("vstower.controltower.controller.Dashboard", {

    // ===================================================================
    // Lifecycle
    // ===================================================================

    onInit: function () {
      this._i18n = this.getView().getModel("i18n").getResourceBundle();
      this._cardIndex = {};
      var oNow = new Date();
      this._wfTo = oNow;
      this._wfFrom = new Date(oNow.getTime() - 30 * 86400000);
      // Short Dumps sub-filter (inside the Live section) - default last 7 days.
      this._sdTo = oNow;
      this._sdFrom = new Date(oNow.getTime() - 7 * 86400000);
      this._vm = new JSONModel({
        security: {
          lockedUsers: [], active: [],
          lockedObjByOwner: [], lockedObjList: [], authFails: []
        },
        jobs: { health: [], byStatus: [] },
        transport: { byStatus: [], byOwner: [], recent: [] },
        workforce: { byArea: [], byGroup: [], byPayrollArea: [] },
        workflow: {
          byStatus: [], openNow: [], throughput: [],
          byAgent: [], aging: [], byActualAgent: [],
          raised: 0, processed: 0
        },
        cleanup: { byOwner: [], byType: [], list: [] },
        stability: { list: [] },
        liveHtml: "",
        stabilityHtml: "",
        workflowHtml: "",
        cleanupHtml: "",
        workforceHtml: "",
        meta: {
          autoRefresh: true, liveUpdatedText: "", workflowUpdatedText: "",
          stabilityUpdatedText: "",
          wfFrom: this._wfFrom, wfTo: this._wfTo,
          sdFrom: this._sdFrom, sdTo: this._sdTo, sdUser: ""
        }
      });
      this.getView().setModel(this._vm);
      this._loadLive();
      this._loadWorkflowSection();
      this._loadContext();
      this._startAutoRefresh();
    },

    // Bind the card-grid click/keyboard handling exactly once. Every card in
    // all three sections is markup inside a bound sap.ui.core.HTML block that
    // is regenerated wholesale on refresh, so the listener lives on a stable
    // ancestor (the view's root node), not on the cards.
    onAfterRendering: function () {
      if (this._clickBound) { return; }
      var oRoot = this.getView().getDomRef();
      if (!oRoot) { return; }
      oRoot.addEventListener("click", this._onGridClick.bind(this));
      oRoot.addEventListener("keydown", this._onGridKeydown.bind(this));
      this._clickBound = true;
    },

    onExit: function () {
      this._stopAutoRefresh();
      if (this._dialog) { this._dialog.destroy(); }
      if (this._helpDialog) { this._helpDialog.destroy(); }
    },

    // Header refresh button - reload everything, bypassing the throttles.
    onRefresh: function () {
      this.getView().getModel("odata").refresh();
      this._stabilityNextFetch = 0;
      this._secExtraNextFetch = 0;
      this._loadLive();
      this._loadWorkflowSection();
      this._loadContext();
    },

    // Workflow-section refresh button - reload only that section.
    onRefreshWorkflow: function () {
      this._loadWorkflowSection();
    },

    // Workflow date-range picker changed - reload the section with the new
    // window. Defaults to the last 30 days (set in onInit).
    onWorkflowRangeChange: function (oEvent) {
      var oFrom = oEvent.getParameter("from");
      var oTo = oEvent.getParameter("to");
      if (!oFrom || !oTo) { return; }
      this._wfFrom = oFrom;
      this._wfTo = oTo;
      this._loadWorkflowSection();
    },

    // Short Dumps sub-filter (inside the Live section). Changing the date
    // range or the user re-queries the dumps and re-renders just those cards.
    onStabilityRangeChange: function (oEvent) {
      var oFrom = oEvent.getParameter("from");
      var oTo = oEvent.getParameter("to");
      if (!oFrom || !oTo) { return; }
      this._sdFrom = oFrom;
      this._sdTo = oTo;
      this._stabilityNextFetch = 0;
      this._loadStability().then(this._renderAll.bind(this));
    },

    onStabilityUserChange: function (oEvent) {
      this._vm.setProperty("/meta/sdUser", (oEvent.getParameter("value") || "").trim());
      this._renderAll();
    },

    onRefreshStability: function () {
      this._stabilityNextFetch = 0;
      this._loadStability().then(this._renderAll.bind(this));
    },

    onToggleAutoRefresh: function (oEvent) {
      var bOn = oEvent.getParameter("state");
      this._vm.setProperty("/meta/autoRefresh", bOn);
      if (bOn) {
        this._loadLive();
        this._startAutoRefresh();
      } else {
        this._stopAutoRefresh();
      }
    },

    _startAutoRefresh: function () {
      this._stopAutoRefresh();
      this._refreshTimer = setInterval(function () {
        // In-flight guard: skip a tick rather than stack requests.
        if (this._liveRefreshing) { return; }
        this._loadLive();
      }.bind(this), REFRESH_MS);
    },

    _stopAutoRefresh: function () {
      if (this._refreshTimer) {
        clearInterval(this._refreshTimer);
        this._refreshTimer = null;
      }
    },

    // ===================================================================
    // Card-grid click handling -> drill-down dialog
    // ===================================================================

    _onGridClick: function (e) {
      var oCardEl = e.target.closest && e.target.closest(".card");
      if (!oCardEl) { return; }
      this._openDetail(oCardEl.getAttribute("data-id"));
    },

    _onGridKeydown: function (e) {
      if (e.key !== "Enter" && e.key !== " ") { return; }
      var oCardEl = e.target.closest && e.target.closest(".card");
      if (!oCardEl) { return; }
      e.preventDefault();
      this._openDetail(oCardEl.getAttribute("data-id"));
    },

    _getDialog: function () {
      if (this._dialog) { return this._dialog; }
      this._dialogHtml = new HTML({ sanitizeContent: false });
      this._dialog = new Dialog({
        contentWidth: "48rem",
        contentHeight: "32rem",
        resizable: true,
        draggable: true,
        content: [this._dialogHtml],
        endButton: new Button({
          text: this._i18n.getText("close"),
          press: function () { this._dialog.close(); }.bind(this)
        })
      });
      this.getView().addDependent(this._dialog);
      return this._dialog;
    },

    // Help dialog - a standing guide to what the dashboard covers, kept in
    // one place (_helpHtml) so it can't drift from the actual cards.
    onHelp: function () {
      if (!this._helpDialog) {
        this._helpDialogHtml = new HTML({ sanitizeContent: false });
        this._helpDialog = new Dialog({
          title: this._i18n.getText("helpTitle"),
          contentWidth: "44rem",
          contentHeight: "34rem",
          resizable: true,
          draggable: true,
          content: [this._helpDialogHtml],
          endButton: new Button({
            text: this._i18n.getText("close"),
            press: function () { this._helpDialog.close(); }.bind(this)
          })
        });
        this.getView().addDependent(this._helpDialog);
        this._helpDialogHtml.setContent(this._helpHtml());
      }
      this._helpDialog.open();
    },

    _helpHtml: function () {
      return [
        '<div class="ctHelp">',

        '<p>The <b>Control Tower</b> gives an HR / technical team lead one place to see',
        ' what is happening across the on-prem SAP landscape and, where something needs',
        ' attention, who to talk to. It is <b>read-only</b> – it never changes anything',
        ' in SAP.</p>',

        '<h4>How the page is organised</h4>',
        '<p>Five sections, top to bottom. Each one says how fresh its data is.</p>',
        '<ul>',
        '<li><b>Live</b> – current-state cards. Refreshes itself <b>every 5 seconds</b>',
        ' (the switch in the top bar pauses it). Use this for "what needs a look right now".',
        ' It covers the Action Center, four <b>Security</b> cards (Locked Users, Active',
        ' User IDs, Locked Objects, Failed Auth Attempts), Background Jobs, and Transport.',
        ' The <b>Short Dumps</b> cards sit at the end of this section with their own',
        ' <b>date range + user filter</b> (default: last 7 days, all users) – they read',
        ' the ABAP runtime-error log (ST22 / table SNAP), which no normal report or',
        ' SE16N can open, and refresh on the Live cycle but <b>throttled to about once',
        ' a minute</b> (the read is heavier than a normal query). Three cards:',
        '<ul>',
        '<li><b>Recent Short Dumps</b> – the latest 15 in the range: time, user, and',
        ' the runtime-error name (or short text). This is the default view.</li>',
        '<li><b>Dumps by User</b> – who is hitting them. Type an ID into the filter box',
        ' to drill into one user.</li>',
        '<li><b>Dumps per Day</b> – a bar per day, to see when something started or spiked.</li>',
        '</ul>',
        ' Severity dots: <span class="status-chip chip-crit">Critical</span> = retained',
        ' in ST22 by an admin; <span class="status-chip chip-warn">Warning</span> = last',
        ' 24 hours; <span class="status-chip chip-good">Info</span> = older. Every card',
        ' drills to the full list (time, user, runtime error, short text, program,',
        ' retained). Runtime-error name / short text come from the ST22 reader – if a',
        ' row shows "–" there, that enrichment is not available on this system yet.</li>',
        '<li><b>Workflow</b> – approvals and work items. Pick a <b>date range</b>',
        ' at the top of the section (defaults to the last 30 days); the',
        ' throughput and "cleared by agent" cards recalculate for that window.',
        ' The "pending by approver", "aging" and "by status" cards are always',
        ' as-of-now – a date range can\'t sensibly say what is still stuck.',
        ' Refreshes on demand (the section\'s own refresh button), not on the 5s cycle.</li>',
        '<li><b>Custom Code Cleanup</b> – custom (<code>Z*</code>/<code>Y*</code>)',
        ' repository objects still sitting in a <b>modifiable transport that has not',
        ' moved in 6+ months</b>. The intent: find abandoned development so the object',
        ' and its transport can be reviewed and removed. Two cards – by owner (who has',
        ' the most to clear) and by object type – both drill to the full list',
        ' (type, object, package, author, request, request date, age in days).',
        ' Loaded once when the page opens; refreshes with "Refresh everything".</li>',
        '<li><b>Workforce Context</b> – headcount and payroll reference figures.',
        ' Loaded once; it barely changes.</li>',
        '</ul>',

        '<h4>Reading a card</h4>',
        '<p>Every card shows a <b>big number</b> (the headline figure), a small',
        ' <b>chart</b> with its values listed beside it, and a one-line <b>finding</b>',
        ' in plain English. <b>Click any card</b> (or press Enter on it) to open the',
        ' full detail list behind that number.</p>',

        '<h4>The cards</h4>',
        '<table class="detail"><thead><tr><th>Card</th><th>What it shows</th></tr></thead><tbody>',
        this._helpRow("Action Center", "Everything needing attention across all domains below, worst first, each row with a contact to chase."),
        this._helpRow("Locked Users", "User accounts locked right now, split by user type. The list gives you the usernames to raise with Basis."),
        this._helpRow("Active User IDs", "Unlocked accounts, by user type and how recently each logged on (0-30 / 31-90 / 90+ days / Never). For scoping who is actually using the system."),
        this._helpRow("Locked Objects", "Custom Z*/Y* repository objects currently checked out in an open (modifiable) transport, grouped by who holds the lock - so you know what not to touch. Drill-down: object, owner, request, date."),
        this._helpRow("Failed Auth Attempts", "Failed-authorization / blocked-transaction events from the Security Audit Log (last 14 days), by user. If empty, the audit log is not active (SM19) or not readable here."),
        this._helpRow("Background Jobs – Health", "Jobs whose most recent run is not a clean finish (aborted, or still pending / running)."),
        this._helpRow("Background Jobs – by Owner", "The same jobs grouped by who scheduled them, so you can see whose jobs are stuck."),
        this._helpRow("Transport – Status", "Transport requests still in the landscape (Modifiable, or Released but not yet imported). Ones already moved on are not shown."),
        this._helpRow("Transport – by Owner", "Open vs. released transport count per developer / consultant ID – who has the most sitting open."),
        this._helpRow("Workflow – Throughput", "How many work items were raised, and how many processed, inside the chosen date range."),
        this._helpRow("Workflow – by Status", "Open work items right now, by status, oldest first in the drill-down with each one's age."),
        this._helpRow("Workflow – Pending by Approver", "Whose inbox the open items sit in, as of now. An item offered to several people counts for each of them."),
        this._helpRow("Workflow – Backlog Aging", "The current open queue split by age: 0–7 days / 8–30 / 30+. The 30+ slice is the one to watch."),
        this._helpRow("Workflow – Cleared by Agent", "Who completed the most work items inside the chosen date range."),
        this._helpRow("Recent Short Dumps", "The latest 15 ABAP runtime errors in the selected date range: time, user, runtime-error name. The default Short Dumps view. Click for the full list with short text and program."),
        this._helpRow("Dumps by User", "Which users are hitting short dumps in the range. Use the filter box above the section to focus on one ID."),
        this._helpRow("Dumps per Day", "One bar per day – to see when a recurring dump started, or when a spike happened."),
        this._helpRow("Stale Objects by Owner", "Custom Z*/Y* objects still in a modifiable transport 6+ months old, grouped by author – who has the most to clean up. Drill-down lists every object with its request and age."),
        this._helpRow("Stale Objects by Type", "The same objects by kind, shown with a plain description (Program, Class, Data Element, ...) not just the 4-char code."),
        this._helpRow("Headcount by Company / by Employee Group / Payroll Areas", "Where the workforce sits. Context, not alerts – these cards never pulse."),
        '</tbody></table>',

        '<h4>Colour and status</h4>',
        '<ul>',
        '<li><span class="status-chip chip-crit">Red</span> – critical / negative: an error, an aborted job, a locked account.</li>',
        '<li><span class="status-chip chip-warn">Orange</span> – warning: needs attention but not broken.</li>',
        '<li><span class="status-chip chip-good">Green</span> – positive / done.</li>',
        '</ul>',
        '<p>A Live card <b>pulses</b> softly when its number is above zero – i.e. it has',
        ' something for you to act on.</p>',

        '<h4>What is still being built</h4>',
        '<ul>',
        '<li><b>Business names for more codes</b> – cost centre and org unit',
        ' (company code, employee group and payroll area already show their name;',
        ' repository object types now show a description too).</li>',
        '<li><b>Short-dump text</b> – the runtime-error name / short text / program are',
        ' read best-effort from the ST22 reader. Where a row shows "–", that reader',
        ' is not wired for this system\'s release yet.</li>',
        '<li><b>Failed Auth Attempts</b> – read best-effort from the Security Audit Log.',
        ' An empty card means the audit log is not active or not readable, not that',
        ' there were no failures.</li>',
        '<li><b>Interfaces and other areas</b> – planned for a later phase.</li>',
        '</ul>',

        '</div>'
      ].join("");
    },

    _helpRow: function (sCard, sWhat) {
      return "<tr><td><b>" + this._esc(sCard) + "</b></td><td>" + this._esc(sWhat) + "</td></tr>";
    },

    _openDetail: function (sId) {
      var c = this._cardIndex[sId];
      if (!c) { return; }
      var oDialog = this._getDialog();
      oDialog.setTitle(c.title + " — " + this._i18n.getText("dialogSuffix"));
      this._dialogHtml.setContent(this._detailTableHtml(c.detailCols, c.detailRows));
      oDialog.open();
    },

    _detailTableHtml: function (aCols, aRows) {
      if (!aRows.length) {
        return '<p class="ctEmptyDetail">' + this._esc(this._i18n.getText("actionNone")) + "</p>";
      }
      var head = "<tr>" + aCols.map(function (c) { return "<th>" + this._esc(c) + "</th>"; }.bind(this)).join("") + "</tr>";
      var body = aRows.map(function (r) {
        return "<tr>" + r.map(function (cell) { return "<td>" + cell + "</td>"; }).join("") + "</tr>";
      }).join("");
      return '<table class="detail"><thead>' + head + "</thead><tbody>" + body + "</tbody></table>";
    },

    // ===================================================================
    // Data loading - three independent groups
    // ===================================================================

    _loadLive: function () {
      this._liveRefreshing = true;
      this._setError("");
      return Promise.all([
        this._loadSecurity(),
        this._maybeLoadSecurityExtra(),
        this._loadJobs(),
        this._loadTransport(),
        this._maybeLoadStability()
      ]).catch(function (e) {
        this._setError((e && e.message) || String(e));
      }.bind(this)).then(function () {
        this._renderAll();
        this._liveRefreshing = false;
        this._vm.setProperty("/meta/liveUpdatedText", new Date().toLocaleTimeString());
      }.bind(this));
    },

    _loadWorkflowSection: function () {
      return this._loadWorkflow().catch(function (e) {
        this._setError((e && e.message) || String(e));
      }.bind(this)).then(function () {
        this._renderAll();
        this._vm.setProperty("/meta/workflowUpdatedText", new Date().toLocaleTimeString());
      }.bind(this));
    },

    _loadContext: function () {
      return Promise.all([
        this._loadWorkforce(),
        this._loadCleanup()
      ]).catch(function (e) {
        this._setError((e && e.message) || String(e));
      }.bind(this)).then(function () {
        this._renderAll();
      }.bind(this));
    },

    // Short Dumps (in the Live section) - ABAP short dumps (ST22), backed by
    // a RAP custom entity + query class (ZCL_TWR_SHORTDUMP_QRY) because SNAP
    // is a clustered table no CDS can read. Reading it hits an ABAP loop
    // over SNAP + the ST22 reader FM, so it is throttled to once a minute
    // rather than fetched on every 5s live tick. Date-range / user filtering
    // is applied client-side in _collectCards; the only filter sent to the
    // backend is a lower date bound, so a range wider than the class's
    // default 30-day window still returns data.
    _maybeLoadStability: function () {
      var now = Date.now();
      if (this._stabilityNextFetch && now < this._stabilityNextFetch) {
        return Promise.resolve();
      }
      this._stabilityNextFetch = now + 60000;
      return this._loadStability();
    },

    _loadStability: function () {
      this._vm.setProperty("/meta/sdFrom", this._sdFrom);
      this._vm.setProperty("/meta/sdTo", this._sdTo);
      // The query class returns a fixed ~30-day window; date-range + user
      // filtering is applied client-side in _collectCards. No $filter is
      // sent, so the RAP query provider stays as simple as possible.
      return this._read("/ShortDump", 5000)
        .then(function (rows) {
          this._vm.setProperty("/stability/list", rows);
          this._vm.setProperty("/meta/stabilityUpdatedText", new Date().toLocaleTimeString());
        }.bind(this)).catch(function () {
          // A dump-reader hiccup must not break the Live refresh - keep the
          // last list and let the next tick retry.
          this._stabilityNextFetch = 0;
        }.bind(this));
    },

    // Custom Code Cleanup section - current-state, loads once (not on the 5s
    // poll). Custom objects locked in an unreleased transport 6+ months old.
    _loadCleanup: function () {
      return Promise.all([
        this._read("/StaleObjectByOwner"),
        this._read("/StaleObjectByType"),
        this._read("/StaleObject", 500)
      ]).then(function (res) {
        this._vm.setProperty("/cleanup/byOwner", res[0]);
        this._vm.setProperty("/cleanup/byType", res[1]);
        this._vm.setProperty("/cleanup/list", res[2]);
      }.bind(this));
    },

    // Read an OData V4 collection into a plain array of plain objects.
    // aFilters/aSorters are optional sap.ui.model.Filter/Sorter arrays.
    _read: function (sPath, iTop, aFilters, aSorters) {
      var oList = this.getView().getModel("odata").bindList(sPath, null, aSorters || [], aFilters || [], { $count: false });
      return oList.requestContexts(0, iTop || 2000).then(function (aCtx) {
        return aCtx.map(function (c) { return c.getObject(); });
      });
    },

    _num: function (v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; },

    _esc: function (v) {
      return String(v === undefined || v === null ? "" : v).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    },


    _titleCase: function (s) {
      s = String(s || "");
      return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
    },

    // 4-char R3TR object type -> "Program (PROG)". Falls back to the code.
    _objTypeText: function (sCode) {
      var c = String(sCode || "").toUpperCase().trim();
      return OBJ_TYPE_TEXT[c] ? OBJ_TYPE_TEXT[c] + " (" + c + ")" : (c || "-");
    },

    // Date <-> YYYYMMDD (the form the workflow date columns are stored as -
    // see ZI_TWR_WORKITEM; range $filter is a string compare on this).
    _ymd: function (d) {
      if (!d) { return ""; }
      var mo = d.getMonth() + 1, day = d.getDate();
      return "" + d.getFullYear() + (mo < 10 ? "0" : "") + mo + (day < 10 ? "0" : "") + day;
    },

    _fmtYmd: function (s) {
      s = String(s || "");
      return s.length === 8 ? s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) : "-";
    },

    // "20260908143512" (YYYYMMDDHHMMSS) -> "2026-09-08 14:35"
    _fmtTstamp: function (s) {
      s = String(s || "");
      if (s.length < 12) { return this._fmtYmd(s); }
      return s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8) + " " +
        s.slice(8, 10) + ":" + s.slice(10, 12);
    },

    _daysBetween: function (sYmd, oNow) {
      var s = String(sYmd || "");
      if (s.length !== 8) { return -1; }
      var d = new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
      return Math.floor((oNow - d) / 86400000);
    },

    // Workflow agents are often the 14-char org-object form "US<username>".
    _agentDisplay: function (raw) {
      var s = String(raw || "").trim();
      if (/^US[A-Za-z0-9_]/.test(s)) { return s.slice(2); }
      return s || "(unassigned)";
    },

    // Plain SAP user name (SNAP-UNAME etc.) - just trimmed, never the "US"
    // prefix strip that _agentDisplay does for workflow org objects.
    _userName: function (raw) {
      return String(raw || "").trim() || "(unknown)";
    },

    _groupSum: function (rows, dimField, measureField) {
      var agg = {};
      rows.forEach(function (r) {
        var k = r[dimField] || "(blank)";
        agg[k] = (agg[k] || 0) + this._num(r[measureField]);
      }.bind(this));
      return Object.keys(agg).map(function (k) { return { name: k, value: agg[k] }; });
    },

    _countBy: function (rows, field) {
      var agg = {};
      rows.forEach(function (r) {
        var k = r[field] || "(blank)";
        agg[k] = (agg[k] || 0) + 1;
      });
      return Object.keys(agg).map(function (k) { return { name: k, value: agg[k] }; });
    },

    _sum: function (rows, measureField) {
      return rows.reduce(function (t, r) { return t + this._num(r[measureField]); }.bind(this), 0);
    },

    // Locked accounts - cheap, stays on the 5s live tick.
    _loadSecurity: function () {
      return this._read("/SecurityUser", 200, [new Filter("IsLocked", FilterOperator.EQ, "X")])
        .then(function (lockedUsers) {
          this._vm.setProperty("/security/lockedUsers", lockedUsers);
        }.bind(this)).catch(function () { /* keep last */ });
    },

    // Active IDs / locked objects / auth failures - heavier (the SAL read
    // hits a reader FM), throttled to once a minute like the short dumps.
    _maybeLoadSecurityExtra: function () {
      var now = Date.now();
      if (this._secExtraNextFetch && now < this._secExtraNextFetch) {
        return Promise.resolve();
      }
      this._secExtraNextFetch = now + 60000;
      return Promise.all([
        this._read("/SecurityActive").catch(function () { return []; }),
        this._read("/LockedObjectByOwner").catch(function () { return []; }),
        this._read("/LockedObject", 1000).catch(function () { return []; }),
        this._read("/AuthFailure", 1000).catch(function () { return []; })
      ]).then(function (res) {
        this._vm.setProperty("/security/active", res[0]);
        this._vm.setProperty("/security/lockedObjByOwner", res[1]);
        this._vm.setProperty("/security/lockedObjList", res[2]);
        this._vm.setProperty("/security/authFails", res[3]);
      }.bind(this)).catch(function () {
        this._secExtraNextFetch = 0;
      }.bind(this));
    },

    _loadJobs: function () {
      return Promise.all([
        this._read("/BackgroundJobHealth"),
        this._read("/BackgroundJobHealthSummary")
      ]).then(function (res) {
        var health = res[0], summary = res[1];
        this._vm.setProperty("/jobs/health", health);
        this._vm.setProperty("/jobs/byStatus", this._groupSum(summary, "Status", "JobNameCount"));
      }.bind(this));
    },

    _loadTransport: function () {
      return Promise.all([
        this._read("/TransportSummary"),
        this._read("/TransportByOwner"),
        // "Don't show moved ones, only queued ones" - filter to still-open
        // statuses (D = modifiable, R = released but not yet imported) at the
        // source, newest change first.
        this._read("/TransportRequestSet", 25,
          [new Filter({
            filters: [
              new Filter("RequestStatus", FilterOperator.EQ, "D"),
              new Filter("RequestStatus", FilterOperator.EQ, "R")
            ],
            and: false
          })],
          [new Sorter("ChangedOnDate", true), new Sorter("ChangedOnTime", true)])
      ]).then(function (res) {
        var byStatus = res[0], byOwnerRaw = res[1], recent = res[2];
        var byStatusOpen = this._groupSum(byStatus, "RequestStatus", "RequestCount")
          .filter(function (r) { return r.name === "D" || r.name === "R"; });
        this._vm.setProperty("/transport/byStatus", byStatusOpen);
        this._vm.setProperty("/transport/recent", recent);

        var byOwner = {};
        byOwnerRaw.forEach(function (r) {
          var sOwner = r.Owner || "(unassigned)";
          if (!byOwner[sOwner]) { byOwner[sOwner] = { owner: sOwner, open: 0, released: 0 }; }
          var n = this._num(r.RequestCount);
          if (r.RequestStatus === "D") { byOwner[sOwner].open += n; }
          else if (r.RequestStatus === "R") { byOwner[sOwner].released += n; }
        }.bind(this));
        var aOwnerRows = Object.keys(byOwner).map(function (k) { return byOwner[k]; })
          .sort(function (a, b) { return b.open - a.open; });
        this._vm.setProperty("/transport/byOwner", aOwnerRows);
      }.bind(this));
    },

    _loadWorkforce: function () {
      return Promise.all([
        this._read("/HeadcountOverview"),
        this._read("/HeadcountByGroup"),
        this._read("/PayrollAreaOverview"),
        this._read("/DimensionText")
      ]).then(function (res) {
        var byArea = res[0], byGroup = res[1], byPayroll = res[2], dimText = res[3];
        // code -> business name, keyed by dimension type - see ZC_TWR_DIM_TEXT.
        this._dimText = {};
        dimText.forEach(function (r) {
          if (!this._dimText[r.DimType]) { this._dimText[r.DimType] = {}; }
          this._dimText[r.DimType][r.DimCode] = r.DimText;
        }.bind(this));
        this._vm.setProperty("/workforce/byArea", this._groupSum(byArea, "CompanyCode", "EmployeeCount"));
        this._vm.setProperty("/workforce/byGroup", this._groupSum(byGroup, "EmployeeGroup", "EmployeeCount"));
        this._vm.setProperty("/workforce/byPayrollArea", this._groupSum(byPayroll, "PayrollArea", "EmployeeCount"));
      }.bind(this));
    },

    // "1000" -> "1000 - Dangote Cement PLC" when the text is known, else the
    // bare code. sDimType is one of COMPANY / PERS_AREA / EMP_GROUP /
    // PAYROLL_AREA (see ZC_TWR_DIM_TEXT).
    _dimLabel: function (sDimType, sCode) {
      var m = this._dimText && this._dimText[sDimType];
      var t = m && m[sCode];
      return t ? (sCode + " - " + t) : (sCode || "-");
    },

    _loadWorkflow: function () {
      var sFrom = this._ymd(this._wfFrom);
      var sTo = this._ymd(this._wfTo);
      this._vm.setProperty("/meta/wfFrom", this._wfFrom);
      this._vm.setProperty("/meta/wfTo", this._wfTo);

      var rangeAnd = function (sField) {
        return new Filter({
          filters: [
            new Filter(sField, FilterOperator.GE, sFrom),
            new Filter(sField, FilterOperator.LE, sTo)
          ],
          and: true
        });
      };
      var openOnly = new Filter({
        filters: [
          new Filter("Status", FilterOperator.NE, "COMPLETED"),
          new Filter("Status", FilterOperator.NE, "CANCELLED")
        ],
        and: true
      });

      return Promise.all([
        this._read("/WorkItemSummary"),
        // open items right now, oldest first - feeds the "by status" card,
        // its drill-down and the Action Center (not date-bounded).
        this._read("/WorkItemSet", 40, [openOnly], [new Sorter("CreatedOn", false)]),
        // throughput: rows raised OR processed inside the window.
        this._read("/WorkflowThroughput", 5000,
          [new Filter({ filters: [rangeAnd("CreatedOn"), rangeAnd("ChangedOn")], and: false })]),
        this._read("/WorkflowByAgent", 300),
        this._read("/WorkflowAging", 4000),
        this._read("/WorkflowByActualAgent", 4000, [rangeAnd("ChangedOn")])
      ]).then(function (res) {
        var summary = res[0], openNow = res[1], throughput = res[2],
            byAgent = res[3], aging = res[4], byActual = res[5];

        // WI_STAT / WI_TYPE are widened char fields - trim so string
        // comparisons and the legends are clean whether or not the gateway
        // trims trailing spaces at this width.
        [summary, openNow, throughput].forEach(function (arr) {
          arr.forEach(function (r) {
            if (r.Status != null) { r.Status = String(r.Status).trim(); }
            if (r.WorkItemType != null) { r.WorkItemType = String(r.WorkItemType).trim(); }
          });
        });

        this._vm.setProperty("/workflow/byStatus", this._groupSum(summary, "Status", "ItemCount"));
        this._vm.setProperty("/workflow/openNow", openNow);
        this._vm.setProperty("/workflow/throughput", throughput);
        this._vm.setProperty("/workflow/byAgent", byAgent);
        this._vm.setProperty("/workflow/aging", aging);
        this._vm.setProperty("/workflow/byActualAgent", byActual);

        var inRange = function (s) {
          return s && s.length === 8 && s >= sFrom && s <= sTo;
        };
        var raised = throughput.reduce(function (t, r) {
          return t + (inRange(r.CreatedOn) ? this._num(r.ItemCount) : 0);
        }.bind(this), 0);
        var processed = throughput.reduce(function (t, r) {
          return t + ((inRange(r.ChangedOn) && r.Status === "COMPLETED") ? this._num(r.ItemCount) : 0);
        }.bind(this), 0);
        this._vm.setProperty("/workflow/raised", raised);
        this._vm.setProperty("/workflow/processed", processed);
      }.bind(this));
    },

    // ===================================================================
    // Cross-domain Action Center rows - feeds the Action Center bar chart's
    // data AND its drill-down table. Workflow rows here use whatever the
    // Workflow section last loaded (it isn't on the 5s poll).
    // ===================================================================

    _collectActionItems: function () {
      var vm = this._vm;
      var aItems = [];

      (vm.getProperty("/security/lockedUsers") || []).forEach(function (u) {
        aItems.push({
          domain: "Security", item: u.Username,
          detail: "Account locked (" + (u.UserType || "type n/a") + ")",
          status: "Locked", criticality: 1,
          contact: "Basis / Security Team"
        });
      });

      (vm.getProperty("/security/authFails") || []).slice(0, 20).forEach(function (a) {
        aItems.push({
          domain: "Auth Failures", item: this._userName(a.FailUser),
          detail: (a.FailText || "Authorization check failed") +
            (a.FailTCode ? " (" + a.FailTCode + ")" : "") + " - " + this._fmtTstamp(a.EventTimestamp),
          status: "Blocked", criticality: 2,
          contact: this._userName(a.FailUser) + " / Basis - Security"
        });
      }.bind(this));

      (vm.getProperty("/jobs/health") || []).forEach(function (j) {
        aItems.push({
          domain: "Background Jobs", item: j.JobName,
          detail: "Latest run status: " + j.Status,
          status: j.Status, criticality: this._num(j.StatusCriticality) || 2,
          contact: j.Owner || "Basis - Job Scheduling"
        });
      }.bind(this));

      (vm.getProperty("/transport/recent") || []).forEach(function (t) {
        aItems.push({
          domain: "Transport", item: t.TransportRequest,
          detail: t.RequestStatus === "D" ? "Modifiable - still with the developer" : "Released - queued for import",
          status: TR_STATUS_LABEL[t.RequestStatus] || t.RequestStatus,
          criticality: this._num(t.StatusCriticality) || 2,
          contact: t.Owner || "-"
        });
      }.bind(this));

      (vm.getProperty("/stability/list") || []).forEach(function (d) {
        if (this._num(d.Criticality) !== 1) { return; }
        aItems.push({
          domain: "Short Dumps",
          item: d.RuntimeError || d.ShortText || this._fmtTstamp(d.DumpTimestamp),
          detail: (d.ShortText || d.FlagReason || "Short dump") + " - " + this._fmtTstamp(d.DumpTimestamp) +
            ", user " + this._userName(d.DumpUser),
          status: d.SeverityText || "Critical", criticality: 1,
          contact: this._userName(d.DumpUser) + " / Basis"
        });
      }.bind(this));

      (vm.getProperty("/workflow/openNow") || []).slice(0, 12).forEach(function (w) {
        if (w.Status === "COMPLETED" || w.Status === "CANCELLED") { return; }
        aItems.push({
          domain: "Workflow", item: w.WorkItemId,
          detail: w.WorkItemText || ((w.WorkItemType ? w.WorkItemType + " - " : "") + "status " + this._titleCase(w.Status)),
          status: this._titleCase(w.Status), criticality: 2,
          contact: "See Workflow section"
        });
      }.bind(this));

      aItems.sort(function (a, b) { return a.criticality - b.criticality; });
      return aItems.slice(0, 40);
    },

    _countByDomain: function (aItems) {
      var agg = {};
      aItems.forEach(function (a) { agg[a.domain] = (agg[a.domain] || 0) + 1; });
      return Object.keys(agg).map(function (k) { return { owner: k, open: agg[k], released: 0 }; })
        .sort(function (a, b) { return b.open - a.open; });
    },

    _ownerAgg: function (rows, ownerField) {
      var agg = {};
      rows.forEach(function (r) {
        var k = r[ownerField] || "(unassigned)";
        agg[k] = (agg[k] || 0) + 1;
      });
      return Object.keys(agg).map(function (k) { return { owner: k, open: agg[k], released: 0 }; })
        .sort(function (a, b) { return b.open - a.open; });
    },

    _statusChip: function (iCriticality, sText) {
      var sCls = iCriticality === 1 ? "chip-crit" : iCriticality === 3 ? "chip-good" : "chip-warn";
      return '<span class="status-chip ' + sCls + '">' + this._esc(sText) + "</span>";
    },

    _byName: function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; },

    _topInsight: function (aData, iTotal) {
      if (!aData.length || iTotal === 0) { return "Nothing to report right now."; }
      var top = aData.slice().sort(function (a, b) { return b.value - a.value; })[0];
      var pct = Math.round(top.value / iTotal * 100);
      return "<b>" + this._esc(top.label || top.name) + "</b> is the largest group - " + top.value + " of " + iTotal + " (" + pct + "%).";
    },

    _ownerInsight: function (aOwners, sNoun) {
      if (!aOwners.length || aOwners[0].open === 0) { return "Nothing currently open."; }
      var top = aOwners[0];
      return "<b>" + this._esc(top.owner) + "</b> has " + top.open + " open " + sNoun + " - the most of any ID.";
    },

    // ===================================================================
    // Chart rendering (plain SVG/CSS via sap.ui.core.HTML)
    // ===================================================================

    _donutHtml: function (aData, iSize, iThickness) {
      iSize = iSize || 76; iThickness = iThickness || 13;
      var realTotal = aData.reduce(function (s, d) { return s + d.value; }, 0);
      var total = realTotal || 1;
      var r = (iSize - iThickness) / 2;
      var c = 2 * Math.PI * r;
      var offset = 0;
      var rings = aData.map(function (d, i) {
        var frac = d.value / total;
        var dash = frac * c;
        var color = CAT[i % CAT.length];
        var el = '<circle cx="' + iSize / 2 + '" cy="' + iSize / 2 + '" r="' + r + '" fill="none" stroke="' + color + '" ' +
          'stroke-width="' + iThickness + '" stroke-dasharray="' + dash + " " + (c - dash) + '" stroke-dashoffset="' + (-offset) + '" ' +
          'transform="rotate(-90 ' + iSize / 2 + " " + iSize / 2 + ')" stroke-linecap="butt"/>';
        offset += dash;
        return el;
      });
      var legend = "<ul class=\"legend\">" + aData.map(function (d, i) {
        return '<li><span class="swatch" style="background:' + CAT[i % CAT.length] + '"></span>' +
          this._esc(d.label || d.name) + '<span class="val">' + d.value.toLocaleString() + "</span></li>";
      }.bind(this)).join("") + "</ul>";
      var svg = '<svg class="donut-svg" width="' + iSize + '" height="' + iSize + '" viewBox="0 0 ' + iSize + " " + iSize + '" role="img" aria-label="chart">' +
        '<circle cx="' + iSize / 2 + '" cy="' + iSize / 2 + '" r="' + r + '" fill="none" stroke="var(--sapList_Background,#eef2f6)" stroke-width="' + iThickness + '"/>' +
        rings.join("") + '<text x="50%" y="53%" text-anchor="middle" font-size="13" font-weight="700" fill="var(--sapTextColor,#1a2733)">' + realTotal.toLocaleString() + "</text></svg>";
      return '<div class="chart-col">' + svg + legend + "</div>";
    },

    // Compact ranked list for high-cardinality context data (company codes,
    // employee groups, payroll areas - dozens of entries). A donut + full
    // legend is unreadable at that cardinality; this shows the top N as
    // labelled proportional bars + one "others" row, and the card stays
    // legible. iTotal drives the % of the whole workforce.
    _rankListHtml: function (aData, iTotal) {
      var TOP = 6;
      var sorted = aData.slice().sort(function (a, b) { return b.value - a.value; });
      var total = iTotal || sorted.reduce(function (s, d) { return s + d.value; }, 0) || 1;
      var head = sorted.slice(0, TOP);
      var rest = sorted.slice(TOP);
      var max = head.length ? head[0].value : 1;
      var rows = head.map(function (d, i) {
        var w = Math.max(3, Math.round(d.value / max * 100));
        var name = this._esc(d.label || d.name);
        return '<div class="rank-row">' +
          '<span class="rank-label" title="' + name + '">' + name + '</span>' +
          '<span class="rank-track"><span class="rank-fill" style="width:' + w + '%;background:' + CAT[i % CAT.length] + '"></span></span>' +
          '<span class="rank-val">' + d.value.toLocaleString() + '</span>' +
          '<span class="rank-pct">' + Math.round(d.value / total * 100) + '%</span></div>';
      }.bind(this));
      if (rest.length) {
        var restSum = rest.reduce(function (s, d) { return s + d.value; }, 0);
        rows.push('<div class="rank-row rank-other">' +
          '<span class="rank-label">' + this._esc(this._i18n.getText("othersN", [rest.length])) + '</span>' +
          '<span class="rank-track"></span>' +
          '<span class="rank-val">' + restSum.toLocaleString() + '</span>' +
          '<span class="rank-pct">' + Math.round(restSum / total * 100) + '%</span></div>');
      }
      return '<div class="chart-col"><div class="rank-list">' + rows.join("") + "</div></div>";
    },

    // Plain-English finding for a context card: which entry is biggest, its
    // share of the workforce, and how many entries there are in total.
    _contextInsight: function (aData, iTotal, sUnit) {
      if (!aData.length || !iTotal) { return this._i18n.getText("noData"); }
      var top = aData.slice().sort(function (a, b) { return b.value - a.value; })[0];
      var pct = Math.round(top.value / iTotal * 100);
      return "<b>" + this._esc(top.label || top.name) + "</b> — " +
        top.value.toLocaleString() + " of " + iTotal.toLocaleString() +
        " (" + pct + "%). " + aData.length + " " + sUnit + " in total.";
    },

    _barHtml: function (aOwners) {
      var max = Math.max.apply(null, aOwners.map(function (o) { return o.open + o.released; }).concat([1]));
      var rows = aOwners.slice(0, 6).map(function (o) {
        var openW = Math.round(o.open / max * 100);
        var relW = Math.round(o.released / max * 100);
        return '<div class="bar-row"><span class="who">' + this._esc(o.owner) + "</span>" +
          '<span class="bar-track"><span class="bar-fill-open" style="width:' + openW + '%"></span>' +
          '<span class="bar-fill-rel" style="width:' + relW + '%"></span></span>' +
          '<span class="n">' + (o.open + o.released) + "</span></div>";
      }.bind(this));
      return '<div class="chart-col"><div class="bar-rows">' + rows.join("") + "</div></div>";
    },

    // Compact recent-events list for the Short Dumps default card - one row
    // per dump: severity dot, time, user, and the runtime error (or short
    // text, or the flag reason if the ST22 enrichment came back empty).
    _dumpListHtml: function (aItems) {
      if (!aItems.length) {
        return '<div class="chart-col"><div class="ct-dumplist ct-dumplist-empty">' +
          this._esc(this._i18n.getText("noData")) + "</div></div>";
      }
      var rows = aItems.map(function (it) {
        var cls = it.crit === 1 ? "chip-crit" : it.crit === 3 ? "chip-good" : "chip-warn";
        return '<div class="dl-row">' +
          '<span class="dl-dot ' + cls + '"></span>' +
          '<span class="dl-when">' + this._esc(it.when) + "</span>" +
          '<span class="dl-who">' + this._esc(it.who) + "</span>" +
          '<span class="dl-what" title="' + this._esc(it.what) + '">' + this._esc(it.what) + "</span>" +
          "</div>";
      }.bind(this)).join("");
      return '<div class="chart-col"><div class="ct-dumplist">' + rows + "</div></div>";
    },

    _cardHtml: function (c) {
      var kpi = typeof c.kpi === "number" ? c.kpi.toLocaleString() : this._esc(c.kpi);
      var tip = this._esc(c.title + " — " + c.kpiLabel + ". Click for the full list.");
      var body;
      if (c.chartType === "rank" || c.chartType === "list") {
        var stackChart = c.chartType === "list" ? this._dumpListHtml(c.data) : this._rankListHtml(c.data, c.total);
        body = '<div class="card-body card-stack">' +
          '<div class="kpi-inline"><span class="kpi-num-sm">' + kpi + "</span>" +
          '<span class="kpi-label">' + this._esc(c.kpiLabel) + "</span></div>" +
          stackChart + "</div>";
      } else {
        var chart = c.chartType === "bar" ? this._barHtml(c.data) : this._donutHtml(c.data);
        body = '<div class="card-body"><div class="kpi-col"><div class="kpi-num">' + kpi + "</div>" +
          '<div class="kpi-label">' + this._esc(c.kpiLabel) + "</div></div>" + chart + "</div>";
      }
      return '<div class="card' + (c.attn ? " ctPulseAlert" : "") +
        ((c.chartType === "rank" || c.chartType === "list") ? " card-tall" : "") +
        '" tabindex="0" role="button" data-id="' + c.id + '" aria-haspopup="dialog" title="' + tip + '">' +
        '<div class="card-head"><div><div class="card-title">' + this._esc(c.title) + "</div>" +
        '<div class="card-sub">' + this._esc(c.sub) + "</div></div>" +
        '<div class="expand-hint">' + this._esc(this._i18n.getText("clickToOpen")) + "</div></div>" +
        body +
        '<div class="insight">' + c.insight + "</div></div>";
    },

    // ===================================================================
    // Card catalogue - one entry per tile. Built fresh on every render from
    // whatever the loaders last put in the model.
    // ===================================================================

    _collectCards: function () {
      var vm = this._vm, esc = this._esc.bind(this), byName = this._byName;

      var lockedUsers = vm.getProperty("/security/lockedUsers") || [];
      var secByType = this._countBy(lockedUsers, "UserType").sort(byName);

      // Active IDs - unlocked USR02 accounts, by user type x last-logon bucket.
      // LogonRecency is a char(10) - trim so string compares / labels are clean
      // whether or not the gateway trims trailing spaces at that width.
      var secActiveRaw = (vm.getProperty("/security/active") || []).map(function (r) {
        return {
          UserType: String(r.UserType || "").trim(),
          LogonRecency: String(r.LogonRecency || "").trim(),
          UserCount: r.UserCount
        };
      });
      var secActiveByType = this._groupSum(secActiveRaw, "UserType", "UserCount").sort(byName);
      var secActiveTotal = this._sum(secActiveByType, "value");
      var secActiveRecent = secActiveRaw.reduce(function (t, r) {
        return t + (r.LogonRecency === "0-30 days" ? this._num(r.UserCount) : 0);
      }.bind(this), 0);
      var secActiveRows = secActiveRaw.slice().sort(function (a, b) {
        return String(a.UserType + a.LogonRecency).localeCompare(String(b.UserType + b.LogonRecency));
      }).map(function (r) {
        return [esc(r.UserType), esc(r.LogonRecency), this._num(r.UserCount).toLocaleString()];
      }.bind(this));

      // Locked repository objects - custom objects checked out in an open transport
      var secLockedByOwner = (vm.getProperty("/security/lockedObjByOwner") || []).map(function (r) {
        return { owner: this._userName(r.TransportOwner), open: this._num(r.ObjectCount), released: 0 };
      }.bind(this)).sort(function (a, b) { return b.open - a.open; });
      var secLockedTotal = secLockedByOwner.reduce(function (t, r) { return t + r.open; }, 0);
      var secLockedRows = (vm.getProperty("/security/lockedObjList") || []).slice().sort(function (a, b) {
        return String(a.TransportOwner || "").localeCompare(String(b.TransportOwner || ""));
      }).map(function (r) {
        return [esc(this._objTypeText(r.ObjectType)), esc(r.ObjectName), esc(this._userName(r.TransportOwner)),
          esc(r.TransportRequest), esc(this._fmtYmd(r.ChangedOn))];
      }.bind(this));

      // Failed authorization attempts - Security Audit Log, best-effort
      var secAuthRaw = vm.getProperty("/security/authFails") || [];
      var secAuthByUser = this._ownerAgg(secAuthRaw, "FailUser");
      var secAuthTotal = secAuthRaw.length;
      var secAuthRows = secAuthRaw.slice().sort(function (a, b) {
        return String(b.EventTimestamp || "").localeCompare(String(a.EventTimestamp || ""));
      }).map(function (r) {
        return [esc(this._fmtTstamp(r.EventTimestamp)), esc(this._userName(r.FailUser)),
          esc(r.FailTCode || "-"), esc(r.FailText || "-"), esc(r.FailTerminal || "-")];
      }.bind(this));

      var jobsHealth = vm.getProperty("/jobs/health") || [];
      var jobsByStatus = (vm.getProperty("/jobs/byStatus") || []).slice().sort(byName);
      var jobsTotal = this._sum(jobsByStatus, "value");
      var jobsByOwner = this._ownerAgg(jobsHealth, "Owner");

      var transportRecent = vm.getProperty("/transport/recent") || [];
      var transportByStatus = (vm.getProperty("/transport/byStatus") || []).slice().sort(byName);
      var transportOpenTotal = this._sum(transportByStatus, "value");
      var transportByOwner = vm.getProperty("/transport/byOwner") || [];

      var withLabel = function (rows, sDimType) {
        return rows.map(function (r) {
          return { name: r.name, label: this._dimLabel(sDimType, r.name), value: r.value };
        }.bind(this));
      }.bind(this);

      var workforceArea = withLabel((vm.getProperty("/workforce/byArea") || []).slice().sort(byName), "COMPANY");
      var workforceAreaTotal = this._sum(workforceArea, "value");
      var workforceGroup = withLabel((vm.getProperty("/workforce/byGroup") || []).slice().sort(byName), "EMP_GROUP");
      var workforceGroupTotal = this._sum(workforceGroup, "value");
      var workforcePayroll = withLabel((vm.getProperty("/workforce/byPayrollArea") || []).slice().sort(byName), "PAYROLL_AREA");
      var workforcePayrollTotal = this._sum(workforcePayroll, "value");

      var workflowByStatusRaw = (vm.getProperty("/workflow/byStatus") || []).slice().sort(byName);
      var workflowByStatus = workflowByStatusRaw.map(function (d) {
        return { name: d.name, label: this._titleCase(d.name), value: d.value };
      }.bind(this));
      var workflowOpen = (vm.getProperty("/workflow/openNow") || []).filter(function (w) {
        return w.Status !== "COMPLETED" && w.Status !== "CANCELLED";
      });
      var workflowTotal = this._sum(workflowByStatus, "value");

      // Workflow date-range section aggregations.
      var wfNow = new Date();
      var wfThroughput = vm.getProperty("/workflow/throughput") || [];
      var wfRaised = this._num(vm.getProperty("/workflow/raised"));
      var wfProcessed = this._num(vm.getProperty("/workflow/processed"));

      var wfByAgent = (vm.getProperty("/workflow/byAgent") || []).map(function (r) {
        return { owner: this._agentDisplay(r.AgentId), open: this._num(r.PendingCount), released: 0 };
      }.bind(this)).sort(function (a, b) { return b.open - a.open; });

      var wfBuckets = [
        { name: "0-7 days", value: 0 },
        { name: "8-30 days", value: 0 },
        { name: "30+ days", value: 0 }
      ];
      (vm.getProperty("/workflow/aging") || []).forEach(function (r) {
        var age = this._daysBetween(r.CreatedOn, wfNow);
        var idx = age > 30 ? 2 : age > 7 ? 1 : 0;
        wfBuckets[idx].value += this._num(r.OpenCount);
      }.bind(this));
      var wfAgingTotal = wfBuckets.reduce(function (t, b) { return t + b.value; }, 0);

      var wfClearedAgg = {};
      (vm.getProperty("/workflow/byActualAgent") || []).forEach(function (r) {
        var a = this._agentDisplay(r.ActualAgent);
        wfClearedAgg[a] = (wfClearedAgg[a] || 0) + this._num(r.ProcessedCount);
      }.bind(this));
      var wfClearedByAgent = Object.keys(wfClearedAgg).map(function (k) {
        return { owner: k, open: wfClearedAgg[k], released: 0 };
      }).sort(function (a, b) { return b.open - a.open; });
      var wfClearedTotal = wfClearedByAgent.reduce(function (t, r) { return t + r.open; }, 0);

      var actionItems = this._collectActionItems();
      var actionByDomain = this._countByDomain(actionItems);

      var cards = [];

      cards.push({
        section: "live", id: "attn", attn: actionItems.length > 0,
        title: this._i18n.getText("cardAction"), sub: this._i18n.getText("cardActionSub"),
        kpi: actionItems.length, kpiLabel: this._i18n.getText("kpiActionLabel"),
        chartType: "bar", data: actionByDomain,
        insight: this._ownerInsight(actionByDomain, "items"),
        detailCols: [this._i18n.getText("colDomain"), this._i18n.getText("colItem"), this._i18n.getText("colDetail"), this._i18n.getText("colStatus"), this._i18n.getText("colContact")],
        detailRows: actionItems.map(function (a) {
          return [esc(a.domain), esc(a.item), esc(a.detail), this._statusChip(a.criticality, a.status), esc(a.contact)];
        }.bind(this))
      });

      cards.push({
        section: "live", id: "sec", attn: lockedUsers.length > 0,
        title: this._i18n.getText("cardSec"), sub: this._i18n.getText("cardSecSub"),
        kpi: lockedUsers.length, kpiLabel: this._i18n.getText("kpiSecLabel"),
        chartType: "donut", data: secByType,
        insight: this._topInsight(secByType, lockedUsers.length),
        detailCols: [this._i18n.getText("colUsername"), this._i18n.getText("colType"), this._i18n.getText("colContact")],
        detailRows: lockedUsers.map(function (u) {
          return [esc(u.Username), esc(u.UserType), "Basis / Security Team"];
        })
      });

      cards.push({
        section: "live", id: "sec-active", attn: false,
        title: this._i18n.getText("cardSecActive"), sub: this._i18n.getText("cardSecActiveSub"),
        kpi: secActiveTotal, kpiLabel: this._i18n.getText("kpiSecActive"),
        chartType: "donut", data: secActiveByType,
        insight: secActiveTotal === 0
          ? this._i18n.getText("noData")
          : "<b>" + secActiveRecent.toLocaleString() + "</b> of <b>" + secActiveTotal.toLocaleString() +
            "</b> active IDs logged on in the last 30 days.",
        detailCols: [this._i18n.getText("colType"), this._i18n.getText("colLastLogon"), this._i18n.getText("colCount")],
        detailRows: secActiveRows
      });

      cards.push({
        section: "live", id: "sec-locked-obj",
        attn: secLockedByOwner.length > 0 && secLockedByOwner[0].open > 0,
        title: this._i18n.getText("cardSecLockedObj"), sub: this._i18n.getText("cardSecLockedObjSub"),
        kpi: secLockedTotal, kpiLabel: this._i18n.getText("kpiSecLockedObj"),
        chartType: "bar", data: secLockedByOwner,
        insight: this._ownerInsight(secLockedByOwner, "objects"),
        detailCols: [this._i18n.getText("colType"), this._i18n.getText("colObject"), this._i18n.getText("colOwner"),
          this._i18n.getText("colRequest"), this._i18n.getText("colRequestDate")],
        detailRows: secLockedRows
      });

      cards.push({
        section: "live", id: "sec-auth", attn: secAuthTotal > 0,
        title: this._i18n.getText("cardSecAuth"), sub: this._i18n.getText("cardSecAuthSub"),
        kpi: secAuthTotal, kpiLabel: this._i18n.getText("kpiSecAuth"),
        chartType: "bar", data: secAuthByUser,
        insight: secAuthTotal === 0
          ? this._i18n.getText("secAuthEmpty")
          : this._ownerInsight(secAuthByUser, "attempts"),
        detailCols: [this._i18n.getText("colWhen"), this._i18n.getText("colUsername"),
          this._i18n.getText("colTransaction"), this._i18n.getText("colBlocked"), this._i18n.getText("colTerminal")],
        detailRows: secAuthRows
      });

      cards.push({
        section: "live", id: "jobs-health", attn: jobsTotal > 0,
        title: this._i18n.getText("cardJobsDetail"), sub: this._i18n.getText("cardJobsSub"),
        kpi: jobsTotal, kpiLabel: this._i18n.getText("kpiJobsLabel"),
        chartType: "donut", data: jobsByStatus,
        insight: this._topInsight(jobsByStatus, jobsTotal),
        detailCols: [this._i18n.getText("colJobName"), this._i18n.getText("colStatus"), this._i18n.getText("colOwner")],
        detailRows: jobsHealth.map(function (j) {
          return [esc(j.JobName), this._statusChip(this._num(j.StatusCriticality), j.Status), esc(j.Owner)];
        }.bind(this))
      });

      cards.push({
        section: "live", id: "jobs-owner", attn: jobsByOwner.length > 0 && jobsByOwner[0].open > 0,
        title: this._i18n.getText("cardJobsByOwner"), sub: this._i18n.getText("cardJobsByOwnerSub"),
        kpi: jobsByOwner.length, kpiLabel: this._i18n.getText("kpiJobsOwnerLabel"),
        chartType: "bar", data: jobsByOwner,
        insight: this._ownerInsight(jobsByOwner, "jobs"),
        detailCols: [this._i18n.getText("colJobName"), this._i18n.getText("colStatus"), this._i18n.getText("colOwner")],
        detailRows: jobsHealth.slice().sort(function (a, b) {
          return (a.Owner || "").localeCompare(b.Owner || "");
        }).map(function (j) {
          return [esc(j.JobName), this._statusChip(this._num(j.StatusCriticality), j.Status), esc(j.Owner)];
        }.bind(this))
      });

      cards.push({
        section: "live", id: "transport-status", attn: transportOpenTotal > 0,
        title: this._i18n.getText("cardTransportStatus"), sub: this._i18n.getText("cardTransportStatusSub"),
        kpi: transportOpenTotal, kpiLabel: this._i18n.getText("kpiTransportLabel"),
        chartType: "donut",
        data: transportByStatus.map(function (d) { return { name: d.name, label: TR_STATUS_LABEL[d.name] || d.name, value: d.value }; }),
        insight: this._topInsight(transportByStatus.map(function (d) { return { name: TR_STATUS_LABEL[d.name] || d.name, value: d.value }; }), transportOpenTotal),
        detailCols: [this._i18n.getText("colRequest"), this._i18n.getText("colStatus"), this._i18n.getText("colOwner")],
        detailRows: transportRecent.map(function (t) {
          return [esc(t.TransportRequest),
            this._statusChip(this._num(t.StatusCriticality), TR_STATUS_LABEL[t.RequestStatus] || t.RequestStatus),
            esc(t.Owner)];
        }.bind(this))
      });

      cards.push({
        section: "live", id: "transport-owner", attn: transportByOwner.length > 0 && transportByOwner[0].open > 0,
        title: this._i18n.getText("cardTransportByOwner"), sub: this._i18n.getText("cardTransportByOwnerSub"),
        kpi: transportByOwner.length ? transportByOwner[0].owner : "-", kpiLabel: this._i18n.getText("kpiTransportOwnerLabel"),
        chartType: "bar", data: transportByOwner,
        insight: this._ownerInsight(transportByOwner, "TRs"),
        detailCols: [this._i18n.getText("colRequest"), this._i18n.getText("colStatus"), this._i18n.getText("colOwner")],
        detailRows: transportRecent.slice().sort(function (a, b) {
          return (a.Owner || "").localeCompare(b.Owner || "");
        }).map(function (t) {
          return [esc(t.TransportRequest),
            this._statusChip(this._num(t.StatusCriticality), TR_STATUS_LABEL[t.RequestStatus] || t.RequestStatus),
            esc(t.Owner)];
        }.bind(this))
      });

      // --- Short Dumps (rendered inside the Live section) ---
      // Backend returns ~30 days; the date-range + user filter below is
      // applied client-side so the three cards recompute instantly.

      var dumpsAll = vm.getProperty("/stability/list") || [];
      var sdFromYmd = this._ymd(this._sdFrom);
      var sdToYmd = this._ymd(this._sdTo);
      var sdUser = (vm.getProperty("/meta/sdUser") || "").toUpperCase();
      var dumps = dumpsAll.filter(function (d) {
        var ymd = String(d.DumpDate || "");
        if (ymd && (ymd < sdFromYmd || ymd > sdToYmd)) { return false; }
        if (sdUser && String(d.DumpUser || "").toUpperCase().indexOf(sdUser) < 0) { return false; }
        return true;
      });
      dumps.sort(function (a, b) {
        return String(b.DumpTimestamp || "").localeCompare(String(a.DumpTimestamp || ""));
      });

      var dumpTotal = dumps.length;
      var dumpReason = function (d) {
        return d.RuntimeError || d.ShortText || d.FlagReason || "(short dump)";
      };
      var dumpWindowText = this._fmtYmd(sdFromYmd) + " to " + this._fmtYmd(sdToYmd) +
        (sdUser ? ", user ~" + esc(sdUser) : "");

      var dumpsByUser = this._ownerAgg(dumps, "DumpUser").map(function (o) {
        return { owner: this._userName(o.owner), open: o.open, released: 0 };
      }.bind(this));
      var dumpDistinctUsers = dumpsByUser.length;

      var dumpsByDayMap = {};
      dumps.forEach(function (d) {
        var k = this._fmtYmd(d.DumpDate);
        if (k !== "-") { dumpsByDayMap[k] = (dumpsByDayMap[k] || 0) + 1; }
      }.bind(this));
      var dumpsByDay = Object.keys(dumpsByDayMap).sort().map(function (k) {
        var dt = new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
        return {
          owner: dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          open: dumpsByDayMap[k], released: 0
        };
      });

      var dumpDetailCols = [this._i18n.getText("colWhen"), this._i18n.getText("colUsername"),
        this._i18n.getText("colRuntimeError"), this._i18n.getText("colShortText"),
        this._i18n.getText("colProgram"), this._i18n.getText("colRetained")];
      var dumpRow = function (d) {
        return [
          this._statusChip(this._num(d.Criticality), this._fmtTstamp(d.DumpTimestamp)),
          esc(this._userName(d.DumpUser)),
          esc(d.RuntimeError || "-"),
          esc(d.ShortText || "-"),
          esc(d.AbapProgram || "-"),
          d.IsRetained === "X" ? esc(this._i18n.getText("yes")) : esc(this._i18n.getText("no"))
        ];
      }.bind(this);
      var dumpDetailRows = dumps.map(dumpRow);

      // Card 1 - the default view: latest 15 with time / user / main reason
      cards.push({
        section: "stability", id: "dumps-recent",
        attn: dumps.some(function (d) { return this._num(d.Criticality) === 1; }.bind(this)),
        title: this._i18n.getText("cardDumpsRecent"), sub: this._i18n.getText("cardDumpsRecentSub"),
        kpi: dumpTotal, kpiLabel: this._i18n.getText("kpiDumpsInWindow"),
        chartType: "list",
        data: dumps.slice(0, 15).map(function (d) {
          return {
            crit: this._num(d.Criticality),
            when: this._fmtTstamp(d.DumpTimestamp),
            who: this._userName(d.DumpUser),
            what: dumpReason(d)
          };
        }.bind(this)),
        insight: dumpTotal === 0
          ? "No short dumps for " + dumpWindowText + "."
          : "<b>" + dumpTotal + "</b> dump" + (dumpTotal === 1 ? "" : "s") + " from <b>" + dumpDistinctUsers +
            "</b> user" + (dumpDistinctUsers === 1 ? "" : "s") + " (" + dumpWindowText + "). Latest " +
            esc(this._fmtTstamp((dumps[0] || {}).DumpTimestamp)) + ".",
        detailCols: dumpDetailCols, detailRows: dumpDetailRows
      });

      // Card 2 - which user is hitting them
      cards.push({
        section: "stability", id: "dumps-user", attn: false,
        title: this._i18n.getText("cardDumpsUser"), sub: this._i18n.getText("cardDumpsUserSub"),
        kpi: dumpDistinctUsers, kpiLabel: this._i18n.getText("kpiDumpsUsers"),
        chartType: "bar", data: dumpsByUser,
        insight: this._ownerInsight(dumpsByUser, "dumps"),
        detailCols: dumpDetailCols,
        detailRows: dumps.slice().sort(function (a, b) {
          return String(a.DumpUser || "").localeCompare(String(b.DumpUser || ""));
        }).map(dumpRow)
      });

      // Card 3 - dumps per day, to spot when something started or spiked
      cards.push({
        section: "stability", id: "dumps-day", attn: false,
        title: this._i18n.getText("cardDumpsDay"), sub: this._i18n.getText("cardDumpsDaySub"),
        kpi: dumpTotal, kpiLabel: this._i18n.getText("kpiDumpsInWindow"),
        chartType: "bar", data: dumpsByDay.slice(-6),
        insight: (function () {
          if (!dumpsByDay.length) { return "No dumps in the selected window."; }
          var peak = dumpsByDay.slice().sort(function (a, b) { return b.open - a.open; })[0];
          return "<b>" + peak.open + "</b> on <b>" + esc(peak.owner) + "</b> was the busiest day.";
        })(),
        detailCols: dumpDetailCols, detailRows: dumpDetailRows
      });

      // --- Workflow date-range section (5 cards) ---

      cards.push({
        section: "workflow", id: "wf-throughput", attn: false,
        title: this._i18n.getText("cardWfThroughput"), sub: this._i18n.getText("cardWfThroughputSub"),
        kpi: wfProcessed, kpiLabel: this._i18n.getText("kpiWfProcessed"),
        chartType: "bar",
        data: [
          { owner: this._i18n.getText("wfRaised"), open: wfRaised, released: 0 },
          { owner: this._i18n.getText("wfProcessed"), open: wfProcessed, released: 0 }
        ],
        insight: "<b>" + wfRaised + "</b> raised, <b>" + wfProcessed + "</b> processed in the selected window.",
        detailCols: [this._i18n.getText("colStatus"), this._i18n.getText("colRaisedOn"), this._i18n.getText("colProcessedOn"), this._i18n.getText("colCount")],
        detailRows: wfThroughput.slice().sort(function (a, b) {
          return String(b.ChangedOn || "").localeCompare(String(a.ChangedOn || ""));
        }).slice(0, 200).map(function (r) {
          return [esc(this._titleCase(r.Status)), esc(this._fmtYmd(r.CreatedOn)), esc(this._fmtYmd(r.ChangedOn)), this._num(r.ItemCount).toLocaleString()];
        }.bind(this))
      });

      cards.push({
        section: "workflow", id: "wf-status", attn: workflowOpen.length > 0,
        title: this._i18n.getText("cardWorkflow"), sub: this._i18n.getText("cardWorkflowSub"),
        kpi: workflowOpen.length, kpiLabel: this._i18n.getText("kpiWorkflowLabel"),
        chartType: "donut", data: workflowByStatus,
        insight: this._topInsight(workflowByStatus, workflowTotal),
        detailCols: [this._i18n.getText("colItem"), this._i18n.getText("colDescription"), this._i18n.getText("colStatus"), this._i18n.getText("colAgeDays")],
        detailRows: workflowOpen.map(function (w) {
          var age = this._daysBetween(w.CreatedOn, wfNow);
          return [esc(w.WorkItemId), esc(w.WorkItemText), this._statusChip(2, this._titleCase(w.Status)), age < 0 ? "-" : String(age)];
        }.bind(this))
      });

      cards.push({
        section: "workflow", id: "wf-pending-agent", attn: wfByAgent.length > 0 && wfByAgent[0].open > 0,
        title: this._i18n.getText("cardWfPending"), sub: this._i18n.getText("cardWfPendingSub"),
        kpi: wfByAgent.length, kpiLabel: this._i18n.getText("kpiWfPending"),
        chartType: "bar", data: wfByAgent,
        insight: this._ownerInsight(wfByAgent, "items"),
        detailCols: [this._i18n.getText("colAgent"), this._i18n.getText("colPending")],
        detailRows: wfByAgent.map(function (r) { return [esc(r.owner), r.open.toLocaleString()]; })
      });

      cards.push({
        section: "workflow", id: "wf-aging", attn: wfBuckets[2].value > 0,
        title: this._i18n.getText("cardWfAging"), sub: this._i18n.getText("cardWfAgingSub"),
        kpi: wfAgingTotal, kpiLabel: this._i18n.getText("kpiWfAging"),
        chartType: "donut", data: wfBuckets,
        insight: wfBuckets[2].value > 0
          ? "<b>" + wfBuckets[2].value + "</b> items have been open 30+ days."
          : "Nothing in the queue is older than 30 days.",
        detailCols: [this._i18n.getText("colAgeBucket"), this._i18n.getText("colOpen")],
        detailRows: wfBuckets.map(function (b) { return [esc(b.name), b.value.toLocaleString()]; })
      });

      cards.push({
        section: "workflow", id: "wf-cleared-agent", attn: false,
        title: this._i18n.getText("cardWfCleared"), sub: this._i18n.getText("cardWfClearedSub"),
        kpi: wfClearedTotal, kpiLabel: this._i18n.getText("kpiWfCleared"),
        chartType: "bar", data: wfClearedByAgent,
        insight: wfClearedByAgent.length
          ? "<b>" + this._esc(wfClearedByAgent[0].owner) + "</b> cleared " + wfClearedByAgent[0].open + " - the most in the window."
          : "Nothing was cleared in the selected window.",
        detailCols: [this._i18n.getText("colAgent"), this._i18n.getText("colCleared")],
        detailRows: wfClearedByAgent.map(function (r) { return [esc(r.owner), r.open.toLocaleString()]; })
      });

      // --- Custom Code Cleanup section (2 cards) ---

      var cleanupList = vm.getProperty("/cleanup/list") || [];
      var cleanupByOwner = (vm.getProperty("/cleanup/byOwner") || []).map(function (r) {
        return { owner: r.ObjectAuthor || "(no author)", open: this._num(r.ObjectCount), released: 0 };
      }.bind(this)).sort(function (a, b) { return b.open - a.open; });
      var cleanupTotal = cleanupByOwner.reduce(function (t, r) { return t + r.open; }, 0);
      var cleanupByType = (vm.getProperty("/cleanup/byType") || []).map(function (r) {
        return { name: r.ObjectType || "(none)", label: this._objTypeText(r.ObjectType), value: this._num(r.ObjectCount) };
      }.bind(this)).sort(byName);

      var cleanupRows = cleanupList.slice().sort(function (a, b) {
        return String(b.ChangedOn || "").localeCompare(String(a.ChangedOn || ""));
      }).map(function (r) {
        return [esc(this._objTypeText(r.ObjectType)), esc(r.ObjectName), esc(r.DevClass), esc(r.ObjectAuthor),
          esc(r.TransportRequest), esc(this._fmtYmd(r.ChangedOn))];
      }.bind(this));
      var cleanupCols = [this._i18n.getText("colType"), this._i18n.getText("colObject"), this._i18n.getText("colPackage"),
        this._i18n.getText("colAuthor"), this._i18n.getText("colRequest"), this._i18n.getText("colRequestDate")];

      cards.push({
        section: "cleanup", id: "cleanup-owner", attn: cleanupTotal > 0,
        title: this._i18n.getText("cardCleanupOwner"), sub: this._i18n.getText("cardCleanupOwnerSub"),
        kpi: cleanupTotal, kpiLabel: this._i18n.getText("kpiCleanup"),
        chartType: "bar", data: cleanupByOwner,
        insight: cleanupByOwner.length && cleanupByOwner[0].open > 0
          ? "<b>" + this._esc(cleanupByOwner[0].owner) + "</b> owns " + cleanupByOwner[0].open + " - the most to clean up."
          : "No custom objects stuck in an old transport.",
        detailCols: cleanupCols, detailRows: cleanupRows
      });

      cards.push({
        section: "cleanup", id: "cleanup-type", attn: false,
        title: this._i18n.getText("cardCleanupType"), sub: this._i18n.getText("cardCleanupTypeSub"),
        kpi: cleanupByType.length, kpiLabel: this._i18n.getText("kpiCleanupTypes"),
        chartType: "donut", data: cleanupByType,
        insight: this._topInsight(cleanupByType, cleanupTotal),
        detailCols: cleanupCols, detailRows: cleanupRows
      });

      var byValueDesc = function (a, b) { return b.value - a.value; };
      var contextDetail = function (rows, iTotal) {
        return rows.slice().sort(byValueDesc).map(function (r) {
          var p = iTotal ? Math.round(r.value / iTotal * 100) : 0;
          return [esc(r.label), r.value.toLocaleString(), p + "%"];
        });
      };
      var ctxCols = [this._i18n.getText("colType"), this._i18n.getText("colCount"), this._i18n.getText("colShare")];

      cards.push({
        section: "workforce", id: "hc-area", attn: false,
        title: this._i18n.getText("cardHeadcountArea"), sub: this._i18n.getText("cardHeadcountAreaSub"),
        kpi: workforceAreaTotal, kpiLabel: this._i18n.getText("kpiHeadcountLabel"),
        chartType: "rank", data: workforceArea, total: workforceAreaTotal,
        insight: this._contextInsight(workforceArea, workforceAreaTotal, this._i18n.getText("unitCompanies")),
        detailCols: ctxCols, detailRows: contextDetail(workforceArea, workforceAreaTotal)
      });

      cards.push({
        section: "workforce", id: "hc-group", attn: false,
        title: this._i18n.getText("cardHeadcountGroup"), sub: this._i18n.getText("cardHeadcountGroupSub"),
        kpi: workforceGroupTotal, kpiLabel: this._i18n.getText("kpiHeadcountLabel"),
        chartType: "rank", data: workforceGroup, total: workforceGroupTotal,
        insight: this._contextInsight(workforceGroup, workforceGroupTotal, this._i18n.getText("unitGroups")),
        detailCols: ctxCols, detailRows: contextDetail(workforceGroup, workforceGroupTotal)
      });

      cards.push({
        section: "workforce", id: "payroll", attn: false,
        title: this._i18n.getText("cardPayrollArea"), sub: this._i18n.getText("cardPayrollAreaSub"),
        kpi: workforcePayroll.length, kpiLabel: this._i18n.getText("kpiPayrollLabel"),
        chartType: "rank", data: workforcePayroll, total: workforcePayrollTotal,
        insight: this._contextInsight(workforcePayroll, workforcePayrollTotal, this._i18n.getText("unitPayrollAreas")),
        detailCols: ctxCols, detailRows: contextDetail(workforcePayroll, workforcePayrollTotal)
      });

      return cards;
    },

    _renderAll: function () {
      var aCards = this._collectCards();
      this._cardIndex = {};
      aCards.forEach(function (c) { this._cardIndex[c.id] = c; }.bind(this));

      var bySection = function (s) {
        return '<div class="ctGrid">' +
          aCards.filter(function (c) { return c.section === s; }).map(this._cardHtml.bind(this)).join("") +
          "</div>";
      }.bind(this);

      this._vm.setProperty("/liveHtml", bySection("live"));
      this._vm.setProperty("/stabilityHtml", bySection("stability"));
      this._vm.setProperty("/workflowHtml", bySection("workflow"));
      this._vm.setProperty("/cleanupHtml", bySection("cleanup"));
      this._vm.setProperty("/workforceHtml", bySection("workforce"));
    },

    _setError: function (sText) {
      var s = this.byId("errStrip");
      s.setText(sText || "");
      s.setVisible(!!sText);
    }
  });
});
