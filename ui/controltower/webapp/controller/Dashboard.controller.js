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

  // Small fixed-code label maps (the low-cardinality, stable ones). Anything
  // client-specific or high-cardinality (company code, cost centre, ...)
  // gets a real text view instead - see the staged plan in
  // docs/04_fiori_ui_design.md.
  var SEV_LABEL = { C: "Critical", W: "Warning", I: "Info" };
  var TR_STATUS_LABEL = { D: "Modifiable", R: "Released" };

  return Controller.extend("vstower.controltower.controller.Dashboard", {

    // ===================================================================
    // Lifecycle
    // ===================================================================

    onInit: function () {
      this._i18n = this.getView().getModel("i18n").getResourceBundle();
      this._cardIndex = {};
      this._vm = new JSONModel({
        dq: { byCategory: [], recent: [] },
        security: { lockedUsers: [] },
        jobs: { health: [], byStatus: [] },
        transport: { byStatus: [], byOwner: [], recent: [] },
        workforce: { byArea: [], byGroup: [], byPayrollArea: [] },
        workflow: { byStatus: [], recent: [] },
        liveHtml: "",
        workflowHtml: "",
        workforceHtml: "",
        meta: { autoRefresh: true, liveUpdatedText: "", workflowUpdatedText: "" }
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
        '<ul>',
        '<li><b>Live</b> – current-state cards. Refreshes itself every 5 seconds',
        ' (the switch in the top bar pauses it). Use this for "what needs a look right now".</li>',
        '<li><b>Workflow</b> – analytical view of approvals and work items. Refreshes',
        ' only when you press its refresh button (date-range filtering is being added',
        ' next, defaulting to the last 30 days).</li>',
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
        this._helpRow("Data Quality", "Employee master-data gaps – missing bank details, cost centre, position, email, and duplicate employees."),
        this._helpRow("Security", "User accounts currently locked, split by user type. The list gives you the usernames to raise with Basis."),
        this._helpRow("Background Jobs – Health", "Jobs whose most recent run is not a clean finish (aborted, or still pending / running)."),
        this._helpRow("Background Jobs – by Owner", "The same jobs grouped by who scheduled them, so you can see whose jobs are stuck."),
        this._helpRow("Transport – Status", "Transport requests still in the landscape (Modifiable, or Released but not yet imported). Ones already moved on are not shown."),
        this._helpRow("Transport – by Owner", "Open vs. released transport count per developer / consultant ID – who has the most sitting open."),
        this._helpRow("Workflow", "Work items by status. In-flight items (not yet Completed or Cancelled) are the headline count."),
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
        '<li><b>Workflow date range</b> – raised vs. processed in a chosen window,',
        ' plus "pending by approver" and an age profile of what is stuck.</li>',
        '<li><b>Business names for codes</b> – e.g. company code <i>1000</i> shown with',
        ' its name. Rolling out per dimension.</li>',
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
        this._loadDataQuality(),
        this._loadSecurity(),
        this._loadJobs(),
        this._loadTransport()
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
      return this._loadWorkforce().catch(function (e) {
        this._setError((e && e.message) || String(e));
      }.bind(this)).then(function () {
        this._renderAll();
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

    _sevLabel: function (code) { return SEV_LABEL[code] || code || "-"; },

    _titleCase: function (s) {
      s = String(s || "");
      return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
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

    _loadDataQuality: function () {
      return Promise.all([
        this._read("/DataQualitySummary"),
        this._read("/DataQualityIssue", 50)
      ]).then(function (res) {
        var summary = res[0], recent = res[1];
        this._vm.setProperty("/dq/byCategory", this._groupSum(summary, "Category", "IssueCount"));
        recent.sort(function (a, b) { return this._num(b.SeverityCriticality) - this._num(a.SeverityCriticality); }.bind(this));
        this._vm.setProperty("/dq/recent", recent.slice(0, 10));
      }.bind(this));
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
        this._read("/PayrollAreaOverview")
      ]).then(function (res) {
        var byArea = res[0], byGroup = res[1], byPayroll = res[2];
        this._vm.setProperty("/workforce/byArea", this._groupSum(byArea, "CompanyCode", "EmployeeCount"));
        this._vm.setProperty("/workforce/byGroup", this._groupSum(byGroup, "EmployeeGroup", "EmployeeCount"));
        this._vm.setProperty("/workforce/byPayrollArea", this._groupSum(byPayroll, "PayrollArea", "EmployeeCount"));
      }.bind(this));
    },

    _loadWorkflow: function () {
      return Promise.all([
        this._read("/WorkItemSummary"),
        this._read("/WorkItemSet", 50)
      ]).then(function (res) {
        var summary = res[0], recent = res[1];
        this._vm.setProperty("/workflow/byStatus", this._groupSum(summary, "Status", "ItemCount"));
        this._vm.setProperty("/workflow/recent", recent);
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

      (vm.getProperty("/dq/recent") || []).forEach(function (r) {
        aItems.push({
          domain: "Data Quality", item: r.EmployeeID,
          detail: r.IssueDescription || [r.CheckID, r.FieldName].filter(Boolean).join(" - "),
          status: this._sevLabel(r.Severity), criticality: this._num(r.SeverityCriticality) || 2,
          contact: "HR Master Data Team"
        });
      }.bind(this));

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

      (vm.getProperty("/workflow/recent") || []).forEach(function (w) {
        if (w.Status === "COMPLETED" || w.Status === "CANCELLED") { return; }
        aItems.push({
          domain: "Workflow", item: w.WorkItemId,
          detail: (w.WorkItemType ? w.WorkItemType + " - " : "") + "status " + this._titleCase(w.Status),
          status: this._titleCase(w.Status), criticality: 2,
          contact: "Process owner - see Workflow section"
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
      return "<b>" + this._esc(top.name) + "</b> is the largest group - " + top.value + " of " + iTotal + " (" + pct + "%).";
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
      var total = aData.reduce(function (s, d) { return s + d.value; }, 0) || 1;
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
        rings.join("") + '<text x="50%" y="53%" text-anchor="middle" font-size="13" font-weight="700" fill="var(--sapTextColor,#1a2733)">' + total + "</text></svg>";
      return '<div class="chart-col">' + svg + legend + "</div>";
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
      var chart = c.chartType === "bar" ? this._barHtml(c.data) : this._donutHtml(c.data);
      var kpi = typeof c.kpi === "number" ? c.kpi.toLocaleString() : this._esc(c.kpi);
      var tip = this._esc(c.title + " — " + c.kpiLabel + ". Click for the full list.");
      return '<div class="card' + (c.attn ? " ctPulseAlert" : "") + '" tabindex="0" role="button" data-id="' + c.id + '" aria-haspopup="dialog" title="' + tip + '">' +
        '<div class="card-head"><div><div class="card-title">' + this._esc(c.title) + "</div>" +
        '<div class="card-sub">' + this._esc(c.sub) + "</div></div>" +
        '<div class="expand-hint">' + this._esc(this._i18n.getText("clickToOpen")) + "</div></div>" +
        '<div class="card-body"><div class="kpi-col"><div class="kpi-num">' + kpi + "</div>" +
        '<div class="kpi-label">' + this._esc(c.kpiLabel) + "</div></div>" + chart + "</div>" +
        '<div class="insight">' + c.insight + "</div></div>";
    },

    // ===================================================================
    // Card catalogue - one entry per tile. Built fresh on every render from
    // whatever the loaders last put in the model.
    // ===================================================================

    _collectCards: function () {
      var vm = this._vm, esc = this._esc.bind(this), byName = this._byName;

      var dqCat = (vm.getProperty("/dq/byCategory") || []).slice().sort(byName);
      var dqTotal = this._sum(dqCat, "value");
      var dqRecent = vm.getProperty("/dq/recent") || [];

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

      var workforceArea = (vm.getProperty("/workforce/byArea") || []).slice().sort(byName);
      var workforceAreaTotal = this._sum(workforceArea, "value");
      var workforceGroup = (vm.getProperty("/workforce/byGroup") || []).slice().sort(byName);
      var workforceGroupTotal = this._sum(workforceGroup, "value");
      var workforcePayroll = (vm.getProperty("/workforce/byPayrollArea") || []).slice().sort(byName);
      var workforcePayrollTotal = this._sum(workforcePayroll, "value");

      var workflowByStatusRaw = (vm.getProperty("/workflow/byStatus") || []).slice().sort(byName);
      var workflowByStatus = workflowByStatusRaw.map(function (d) {
        return { name: d.name, label: this._titleCase(d.name), value: d.value };
      }.bind(this));
      var workflowRecent = (vm.getProperty("/workflow/recent") || []).filter(function (w) {
        return w.Status !== "COMPLETED" && w.Status !== "CANCELLED";
      });
      var workflowTotal = this._sum(workflowByStatus, "value");

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
        section: "live", id: "dq", attn: dqTotal > 0,
        title: this._i18n.getText("cardDq"), sub: this._i18n.getText("cardDqSub"),
        kpi: dqTotal, kpiLabel: this._i18n.getText("kpiDqLabel"),
        chartType: "donut", data: dqCat,
        insight: this._topInsight(dqCat, dqTotal),
        detailCols: [this._i18n.getText("colEmployee"), this._i18n.getText("colIssue"), this._i18n.getText("colField"), this._i18n.getText("colStatus")],
        detailRows: dqRecent.map(function (r) {
          return [esc(r.EmployeeID), esc(r.IssueDescription || r.CheckID), esc(r.FieldName), this._statusChip(this._num(r.SeverityCriticality), this._sevLabel(r.Severity))];
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

      cards.push({
        section: "workflow", id: "workflow", attn: workflowRecent.length > 0,
        title: this._i18n.getText("cardWorkflow"), sub: this._i18n.getText("cardWorkflowSub"),
        kpi: workflowRecent.length, kpiLabel: this._i18n.getText("kpiWorkflowLabel"),
        chartType: "donut", data: workflowByStatus,
        insight: this._topInsight(workflowByStatus, workflowTotal),
        detailCols: [this._i18n.getText("colItem"), this._i18n.getText("colType"), this._i18n.getText("colStatus")],
        detailRows: workflowRecent.map(function (w) {
          return [esc(w.WorkItemId), esc(w.WorkItemType), this._statusChip(2, this._titleCase(w.Status))];
        }.bind(this))
      });

      cards.push({
        section: "workforce", id: "hc-area", attn: false,
        title: this._i18n.getText("cardHeadcountArea"), sub: this._i18n.getText("cardHeadcountAreaSub"),
        kpi: workforceAreaTotal, kpiLabel: this._i18n.getText("kpiHeadcountLabel"),
        chartType: "donut", data: workforceArea,
        insight: this._topInsight(workforceArea, workforceAreaTotal),
        detailCols: [this._i18n.getText("colType"), this._i18n.getText("colCount")],
        detailRows: workforceArea.map(function (r) { return [esc(r.name), r.value.toLocaleString()]; })
      });

      cards.push({
        section: "workforce", id: "hc-group", attn: false,
        title: this._i18n.getText("cardHeadcountGroup"), sub: this._i18n.getText("cardHeadcountGroupSub"),
        kpi: workforceGroupTotal, kpiLabel: this._i18n.getText("kpiHeadcountLabel"),
        chartType: "donut", data: workforceGroup,
        insight: this._topInsight(workforceGroup, workforceGroupTotal),
        detailCols: [this._i18n.getText("colType"), this._i18n.getText("colCount")],
        detailRows: workforceGroup.map(function (r) { return [esc(r.name), r.value.toLocaleString()]; })
      });

      cards.push({
        section: "workforce", id: "payroll", attn: false,
        title: this._i18n.getText("cardPayrollArea"), sub: this._i18n.getText("cardPayrollAreaSub"),
        kpi: workforcePayroll.length, kpiLabel: this._i18n.getText("kpiPayrollLabel"),
        chartType: "donut", data: workforcePayroll,
        insight: this._topInsight(workforcePayroll, workforcePayrollTotal),
        detailCols: [this._i18n.getText("colType"), this._i18n.getText("colCount")],
        detailRows: workforcePayroll.map(function (r) { return [esc(r.name), r.value.toLocaleString()]; })
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
      this._vm.setProperty("/workflowHtml", bySection("workflow"));
      this._vm.setProperty("/workforceHtml", bySection("workforce"));
    },

    _setError: function (sText) {
      var s = this.byId("errStrip");
      s.setText(sText || "");
      s.setVisible(!!sText);
    }
  });
});
