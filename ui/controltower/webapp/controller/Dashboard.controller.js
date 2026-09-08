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
      this._vm = new JSONModel({
        security: { lockedUsers: [] },
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
          wfFrom: this._wfFrom, wfTo: this._wfTo
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

    // Header refresh button - reload everything.
    onRefresh: function () {
      this.getView().getModel("odata").refresh();
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
        '<li><b>Live</b> – current-state cards: Action Center, Security, Background',
        ' Jobs, Transport. Refreshes itself <b>every 5 seconds</b> (the switch in the',
        ' top bar pauses it). Use this for "what needs a look right now".</li>',
        '<li><b>System Stability</b> – ABAP <b>short dumps</b> (the ST22 runtime-error',
        ' log) from the last 7 days. Read straight off the runtime-error store, which',
        ' no normal report or SE16N can open. Refreshed on the Live cycle but',
        ' <b>throttled to about once a minute</b> (reading it is heavier than a normal',
        ' query). A dump is flagged:',
        '<ul>',
        '<li><span class="status-chip chip-crit">Critical</span> – an administrator',
        ' <b>retained</b> it in ST22 (someone already decided it matters), <i>or</i>',
        ' the <b>same user hit 3 or more</b> dumps in the 7-day window (something is',
        ' repeatedly breaking for them).</li>',
        '<li><span class="status-chip chip-warn">Warning</span> – raised in the last 24 hours.</li>',
        '<li><span class="status-chip chip-good">Info</span> – older, one-off.</li>',
        '</ul>',
        ' The drill-down gives the time, the user and the application server, and the',
        ' exact reason it was flagged. Critical dumps also appear in the Action Center.',
        ' The runtime-error <i>name</i> and short text are a later addition – they need',
        ' a separate ST22 API.</li>',
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
        this._helpRow("Security", "User accounts currently locked, split by user type. The list gives you the usernames to raise with Basis."),
        this._helpRow("Background Jobs – Health", "Jobs whose most recent run is not a clean finish (aborted, or still pending / running)."),
        this._helpRow("Background Jobs – by Owner", "The same jobs grouped by who scheduled them, so you can see whose jobs are stuck."),
        this._helpRow("Transport – Status", "Transport requests still in the landscape (Modifiable, or Released but not yet imported). Ones already moved on are not shown."),
        this._helpRow("Transport – by Owner", "Open vs. released transport count per developer / consultant ID – who has the most sitting open."),
        this._helpRow("Workflow – Throughput", "How many work items were raised, and how many processed, inside the chosen date range."),
        this._helpRow("Workflow – by Status", "Open work items right now, by status, oldest first in the drill-down with each one's age."),
        this._helpRow("Workflow – Pending by Approver", "Whose inbox the open items sit in, as of now. An item offered to several people counts for each of them."),
        this._helpRow("Workflow – Backlog Aging", "The current open queue split by age: 0–7 days / 8–30 / 30+. The 30+ slice is the one to watch."),
        this._helpRow("Workflow – Cleared by Agent", "Who completed the most work items inside the chosen date range."),
        this._helpRow("Short Dumps", "ABAP runtime errors (ST22) from the last 7 days, split Critical / Warning / Info. Headline number = the Critical ones. Drill-down: time, user, app server, and why each was flagged. Whose code to chase, without opening ST22."),
        this._helpRow("Stale Objects by Owner", "Custom Z*/Y* objects still in a modifiable transport 6+ months old, grouped by author – who has the most to clean up. Drill-down lists every object with its request and age."),
        this._helpRow("Stale Objects by Type", "The same objects by kind (programs / classes / DDIC / function groups / ...)."),
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
        ' (company code, employee group and payroll area already show their name).</li>',
        '<li><b>Short-dump detail</b> – the runtime-error name, short text and',
        ' program (needs the ST22 decompress API; the card shows time / user /',
        ' server today).</li>',
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

    // System Stability - ABAP short dumps (ST22). Backed by a RAP custom
    // entity + query class (ZCL_TWR_SHORTDUMP_QRY) because SNAP is a
    // clustered table no CDS can read. Reading it hits an ABAP loop over
    // SNAP, so this is throttled to once a minute rather than every 5s tick.
    _maybeLoadStability: function () {
      var now = Date.now();
      if (this._stabilityNextFetch && now < this._stabilityNextFetch) {
        return Promise.resolve();
      }
      this._stabilityNextFetch = now + 60000;
      return this._loadStability();
    },

    _loadStability: function () {
      return this._read("/ShortDump", 300).then(function (rows) {
        this._vm.setProperty("/stability/list", rows);
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

    _loadSecurity: function () {
      // Only locked accounts, straight from the service - a manager needs the
      // names to reach out to, not a 4,000+ row dump.
      return this._read("/SecurityUser", 100, [new Filter("IsLocked", FilterOperator.EQ, "X")])
        .then(function (lockedUsers) {
          this._vm.setProperty("/security/lockedUsers", lockedUsers);
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
          domain: "Short Dumps", item: d.RuntimeError || this._fmtTstamp(d.DumpTimestamp),
          detail: (d.FlagReason || "Short dump") + " - user " + this._agentDisplay(d.DumpUser),
          status: d.SeverityText || "Critical", criticality: 1,
          contact: this._agentDisplay(d.DumpUser) + " / Basis"
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

    _cardHtml: function (c) {
      var kpi = typeof c.kpi === "number" ? c.kpi.toLocaleString() : this._esc(c.kpi);
      var tip = this._esc(c.title + " — " + c.kpiLabel + ". Click for the full list.");
      var body;
      if (c.chartType === "rank") {
        body = '<div class="card-body card-stack">' +
          '<div class="kpi-inline"><span class="kpi-num-sm">' + kpi + "</span>" +
          '<span class="kpi-label">' + this._esc(c.kpiLabel) + "</span></div>" +
          this._rankListHtml(c.data, c.total) + "</div>";
      } else {
        var chart = c.chartType === "bar" ? this._barHtml(c.data) : this._donutHtml(c.data);
        body = '<div class="card-body"><div class="kpi-col"><div class="kpi-num">' + kpi + "</div>" +
          '<div class="kpi-label">' + this._esc(c.kpiLabel) + "</div></div>" + chart + "</div>";
      }
      return '<div class="card' + (c.attn ? " ctPulseAlert" : "") + (c.chartType === "rank" ? " card-tall" : "") +
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

      // --- System Stability section (1 card) ---

      var dumps = vm.getProperty("/stability/list") || [];
      var dumpsBySeverity = [
        { name: "Critical", value: 0 },
        { name: "Warning", value: 0 },
        { name: "Info", value: 0 }
      ];
      dumps.forEach(function (d) {
        var c = this._num(d.Criticality);
        dumpsBySeverity[c === 1 ? 0 : c === 2 ? 1 : 2].value += 1;
      }.bind(this));
      var dumpsCritical = dumpsBySeverity[0].value;
      var dumpsByUser = this._ownerAgg(dumps, "DumpUser");

      var dumpRows = dumps.slice().sort(function (a, b) {
        var byCrit = this._num(a.Criticality) - this._num(b.Criticality);
        return byCrit !== 0 ? byCrit
          : String(b.DumpTimestamp || "").localeCompare(String(a.DumpTimestamp || ""));
      }.bind(this)).map(function (d) {
        return [
          esc(this._fmtTstamp(d.DumpTimestamp)),
          esc(this._agentDisplay(d.DumpUser)),
          esc(d.DumpHost),
          this._statusChip(this._num(d.Criticality), d.SeverityText),
          esc(d.FlagReason),
          d.IsRetained === "X" ? this._i18n.getText("yes") : this._i18n.getText("no")
        ];
      }.bind(this));

      cards.push({
        section: "stability", id: "dumps", attn: dumpsCritical > 0,
        title: this._i18n.getText("cardDumps"), sub: this._i18n.getText("cardDumpsSub"),
        kpi: dumpsCritical, kpiLabel: this._i18n.getText("kpiDumps"),
        chartType: "donut", data: dumpsBySeverity,
        insight: dumps.length === 0
          ? "No short dumps in the last 7 days."
          : dumpsCritical > 0
            ? "<b>" + dumpsCritical + "</b> critical of " + dumps.length + " dumps in the last 7 days"
              + (dumpsByUser.length ? " - most from <b>" + esc(dumpsByUser[0].owner) + "</b>." : ".")
            : dumps.length + " dumps in the last 7 days, none flagged critical.",
        detailCols: [this._i18n.getText("colWhen"), this._i18n.getText("colUsername"),
          this._i18n.getText("colAppServer"), this._i18n.getText("colStatus"),
          this._i18n.getText("colReason"), this._i18n.getText("colRetained")],
        detailRows: dumpRows
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
        return { name: r.ObjectType || "(none)", value: this._num(r.ObjectCount) };
      }.bind(this)).sort(byName);

      var cleanupRows = cleanupList.slice().sort(function (a, b) {
        return String(a.ChangedOn || "").localeCompare(String(b.ChangedOn || ""));
      }).map(function (r) {
        return [esc(r.ObjectType), esc(r.ObjectName), esc(r.DevClass), esc(r.ObjectAuthor),
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
