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

  // Poll interval, confirmed by the client after a feasibility review
  // (request-volume math + built-in overlap guard) - see ui/README.md
  // "Live refresh" section. Do not change without re-raising the tradeoff.
  var REFRESH_MS = 5000;

  // Fixed-order categorical palette (dataviz discipline: color follows the
  // entity, never its position/rank in whatever order the data happens to
  // arrive in - _collectCards sorts every chart's data by name before this
  // is applied, so the same category gets the same color every refresh).
  var CAT = ["#0a6ed1", "#e9730c", "#925ace", "#147575", "#bb0044", "#6a6d70", "#c26b00", "#3b7a3b"];

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
        cardsHtml: "",
        meta: { autoRefresh: true, lastUpdatedText: "" }
      });
      this.getView().setModel(this._vm);
      this._loadAll();
      this._startAutoRefresh();
    },

    // Bind the card-grid click/keyboard handling exactly once. The grid's
    // markup is regenerated wholesale on every refresh (it's one bound
    // sap.ui.core.HTML block, not individual controls per card - see the
    // design note in the view), so the listener lives on a stable ancestor
    // (the view's own root node) rather than on the cards themselves, which
    // get replaced every 5 seconds.
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
    },

    onRefresh: function () {
      this.getView().getModel("odata").refresh();
      this._loadAll();
    },

    onToggleAutoRefresh: function (oEvent) {
      var bOn = oEvent.getParameter("state");
      this._vm.setProperty("/meta/autoRefresh", bOn);
      if (bOn) {
        this._loadAll();
        this._startAutoRefresh();
      } else {
        this._stopAutoRefresh();
      }
    },

    _startAutoRefresh: function () {
      this._stopAutoRefresh();
      this._refreshTimer = setInterval(function () {
        // In-flight guard: skip a tick rather than stack requests if a
        // cycle is still running when the next one fires.
        if (this._refreshing) { return; }
        this._loadAll();
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
        contentWidth: "44rem",
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
    // Data loading
    // ===================================================================

    _loadAll: function () {
      this._refreshing = true;
      this._setError("");
      return Promise.all([
        this._loadDataQuality(),
        this._loadSecurity(),
        this._loadJobs(),
        this._loadTransport(),
        this._loadWorkforce(),
        this._loadWorkflow()
      ]).catch(function (e) {
        this._setError((e && e.message) || String(e));
      }.bind(this)).then(function () {
        this._renderCards();
        this._refreshing = false;
        this._vm.setProperty("/meta/lastUpdatedText", new Date().toLocaleTimeString());
      }.bind(this));
    },

    // Read an OData V4 collection into a plain array of plain objects.
    // aFilters/aSorters are optional sap.ui.model.Filter/Sorter arrays -
    // filtering at the source, not pulling everything and trimming
    // client-side, same discipline the CDS layer already applies.
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
      // Only locked accounts, straight from the service - a manager needs
      // the names to reach out to, not a 4,000+ row dump to scroll. (The
      // 2026-09-05 redesign's Security card charts locked-users-by-type,
      // not locked-vs-unlocked, so SecuritySummary itself is no longer
      // read - one fewer request every refresh cycle.)
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
      // TransportTypeSummary is not read here - the 2026-09-05 redesign
      // dropped the "by request type" card (not part of the approved
      // mockup), so fetching it every 5s would just be wasted load.
      return Promise.all([
        this._read("/TransportSummary"),
        this._read("/TransportByOwner"),
        // "Don't show moved ones, only queued ones" - filter to still-open
        // statuses (D = modifiable, R = released but not yet imported) at
        // the source, newest change first.
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
        // Chart + KPI both stay scoped to "still in the landscape" (D/R) -
        // TransportSummary itself can carry other historical status codes,
        // and showing those in the donut while the KPI ignores them would
        // make the two disagree.
        var byStatusOpen = this._groupSum(byStatus, "RequestStatus", "RequestCount")
          .filter(function (r) { return r.name === "D" || r.name === "R"; });
        this._vm.setProperty("/transport/byStatus", byStatusOpen);
        this._vm.setProperty("/transport/recent", recent);

        // Manager ask: "on which IDs how many TRs are left open and how
        // many moved/released" - pivot Owner x RequestStatus into one row
        // per owner, busiest (most open) first.
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
    // Cross-domain Action Center rows (kept as a plain JS list - it feeds
    // both the Action Center bar chart's data AND its drill-down table)
    // ===================================================================

    _collectActionItems: function () {
      var vm = this._vm;
      var aItems = [];

      (vm.getProperty("/dq/recent") || []).forEach(function (r) {
        aItems.push({
          domain: "Data Quality", item: r.EmployeeID,
          detail: [r.CheckID, r.FieldName].filter(Boolean).join(" - "),
          status: r.Severity, criticality: this._num(r.SeverityCriticality) || 2,
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
          status: t.RequestStatus, criticality: this._num(t.StatusCriticality) || 2,
          contact: t.Owner || "-"
        });
      }.bind(this));

      (vm.getProperty("/workflow/recent") || []).forEach(function (w) {
        if (w.Status === "COMPLETED" || w.Status === "CANCELLED") { return; }
        aItems.push({
          domain: "Workflow", item: (w.WorkItemType || "") + " " + w.WorkItemId,
          detail: "Status: " + w.Status,
          status: w.Status, criticality: 2,
          contact: "Process owner - not yet mapped (needs SWWUSERWI)"
        });
      });

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
    // Chart rendering (plain SVG/CSS via sap.ui.core.HTML - see the design
    // note in Dashboard.view.xml for why, in place of sap.viz VizFrame)
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
          this._esc(d.name) + '<span class="val">' + d.value.toLocaleString() + "</span></li>";
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
      return '<div class="card' + (c.attn ? " ctPulseAlert" : "") + '" tabindex="0" role="button" data-id="' + c.id + '" aria-haspopup="dialog">' +
        '<div class="card-head"><div><div class="card-title">' + this._esc(c.title) + "</div>" +
        '<div class="card-sub">' + this._esc(c.sub) + "</div></div>" +
        '<div class="expand-hint">' + this._esc(this._i18n.getText("clickToOpen")) + "</div></div>" +
        '<div class="card-body"><div class="kpi-col"><div class="kpi-num">' + kpi + "</div>" +
        '<div class="kpi-label">' + this._esc(c.kpiLabel) + "</div></div>" + chart + "</div>" +
        '<div class="insight">' + c.insight + "</div></div>";
    },

    // ===================================================================
    // Card catalogue - one entry per tile in the grid. Built fresh every
    // refresh from whatever the six domain loaders just put in the model.
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
      // Already filtered to D/R ("still in the landscape") in _loadTransport.
      var transportByStatus = (vm.getProperty("/transport/byStatus") || []).slice().sort(byName);
      var transportOpenTotal = this._sum(transportByStatus, "value");
      var transportByOwner = vm.getProperty("/transport/byOwner") || [];

      var workforceArea = (vm.getProperty("/workforce/byArea") || []).slice().sort(byName);
      var workforceAreaTotal = this._sum(workforceArea, "value");
      var workforceGroup = (vm.getProperty("/workforce/byGroup") || []).slice().sort(byName);
      var workforceGroupTotal = this._sum(workforceGroup, "value");
      var workforcePayroll = (vm.getProperty("/workforce/byPayrollArea") || []).slice().sort(byName);
      var workforcePayrollTotal = this._sum(workforcePayroll, "value");

      var workflowByStatus = (vm.getProperty("/workflow/byStatus") || []).slice().sort(byName);
      var workflowRecent = (vm.getProperty("/workflow/recent") || []).filter(function (w) {
        return w.Status !== "COMPLETED" && w.Status !== "CANCELLED";
      });
      var workflowTotal = this._sum(workflowByStatus, "value");

      var actionItems = this._collectActionItems();
      var actionByDomain = this._countByDomain(actionItems);

      var cards = [];

      cards.push({
        section: "attention", id: "attn", attn: actionItems.length > 0,
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
        section: "attention", id: "dq", attn: dqTotal > 0,
        title: this._i18n.getText("cardDq"), sub: this._i18n.getText("cardDqSub"),
        kpi: dqTotal, kpiLabel: this._i18n.getText("kpiDqLabel"),
        chartType: "donut", data: dqCat,
        insight: this._topInsight(dqCat, dqTotal),
        detailCols: [this._i18n.getText("colEmployee"), this._i18n.getText("colCheck"), this._i18n.getText("colField"), this._i18n.getText("colStatus")],
        detailRows: dqRecent.map(function (r) {
          return [esc(r.EmployeeID), esc(r.CheckID), esc(r.FieldName), this._statusChip(this._num(r.SeverityCriticality), r.Severity)];
        }.bind(this))
      });

      cards.push({
        section: "attention", id: "sec", attn: lockedUsers.length > 0,
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
        section: "attention", id: "jobs-health", attn: jobsTotal > 0,
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
        section: "attention", id: "jobs-owner", attn: jobsByOwner.length > 0 && jobsByOwner[0].open > 0,
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
        section: "attention", id: "transport-status", attn: transportOpenTotal > 0,
        title: this._i18n.getText("cardTransportStatus"), sub: this._i18n.getText("cardTransportStatusSub"),
        kpi: transportOpenTotal, kpiLabel: this._i18n.getText("kpiTransportLabel"),
        chartType: "donut", data: transportByStatus,
        insight: this._topInsight(transportByStatus, transportOpenTotal),
        detailCols: [this._i18n.getText("colRequest"), this._i18n.getText("colStatus"), this._i18n.getText("colOwner")],
        detailRows: transportRecent.map(function (t) {
          return [esc(t.TransportRequest),
            this._statusChip(this._num(t.StatusCriticality), t.RequestStatus === "D" ? "Modifiable" : "Released"),
            esc(t.Owner)];
        }.bind(this))
      });

      cards.push({
        section: "attention", id: "transport-owner", attn: transportByOwner.length > 0 && transportByOwner[0].open > 0,
        title: this._i18n.getText("cardTransportByOwner"), sub: this._i18n.getText("cardTransportByOwnerSub"),
        kpi: transportByOwner.length ? transportByOwner[0].owner : "-", kpiLabel: this._i18n.getText("kpiTransportOwnerLabel"),
        chartType: "bar", data: transportByOwner,
        insight: this._ownerInsight(transportByOwner, "TRs"),
        detailCols: [this._i18n.getText("colRequest"), this._i18n.getText("colStatus"), this._i18n.getText("colOwner")],
        detailRows: transportRecent.slice().sort(function (a, b) {
          return (a.Owner || "").localeCompare(b.Owner || "");
        }).map(function (t) {
          return [esc(t.TransportRequest),
            this._statusChip(this._num(t.StatusCriticality), t.RequestStatus === "D" ? "Modifiable" : "Released"),
            esc(t.Owner)];
        }.bind(this))
      });

      cards.push({
        section: "attention", id: "workflow", attn: workflowRecent.length > 0,
        title: this._i18n.getText("cardWorkflow"), sub: this._i18n.getText("cardWorkflowSub"),
        kpi: workflowRecent.length, kpiLabel: this._i18n.getText("kpiWorkflowLabel"),
        chartType: "donut", data: workflowByStatus,
        insight: this._topInsight(workflowByStatus, workflowTotal),
        detailCols: [this._i18n.getText("colItem"), this._i18n.getText("colType"), this._i18n.getText("colStatus")],
        detailRows: workflowRecent.map(function (w) {
          return [esc(w.WorkItemId), esc(w.WorkItemType), esc(w.Status)];
        })
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

    _renderCards: function () {
      var aCards = this._collectCards();
      this._cardIndex = {};
      aCards.forEach(function (c) { this._cardIndex[c.id] = c; });

      var attention = aCards.filter(function (c) { return c.section === "attention"; });
      var workforce = aCards.filter(function (c) { return c.section === "workforce"; });

      var html =
        '<div class="section-label">' + this._esc(this._i18n.getText("sectionAttention")) + "</div>" +
        '<div class="ctGrid">' + attention.map(this._cardHtml.bind(this)).join("") + "</div>" +
        '<div class="section-label">' + this._esc(this._i18n.getText("sectionWorkforce")) + "</div>" +
        '<div class="ctGrid">' + workforce.map(this._cardHtml.bind(this)).join("") + "</div>";

      this._vm.setProperty("/cardsHtml", html);
    },

    _setError: function (sText) {
      var s = this.byId("errStrip");
      s.setText(sText || "");
      s.setVisible(!!sText);
    }
  });
});
