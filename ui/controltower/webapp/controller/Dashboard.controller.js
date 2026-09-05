sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/model/Sorter"
], function (Controller, JSONModel, Filter, FilterOperator, Sorter) {
  "use strict";

  // Poll interval, confirmed by the client after a feasibility review
  // (request-volume math + built-in overlap guard) - see ui/README.md
  // "Live refresh" section. Do not change without re-raising the tradeoff.
  var REFRESH_MS = 5000;
  var ANIM_MS = 600;

  // sap.viz donut chart ids that need the same title/legend/data-label
  // configuration - see _configureCharts.
  var VIZ_IDS = [
    "vizDq", "vizSec", "vizJobs", "vizTransportStatus", "vizTransportType",
    "vizHeadcountArea", "vizHeadcountGroup", "vizPayrollArea", "vizWorkflow"
  ];

  return Controller.extend("vstower.controltower.controller.Dashboard", {

    onInit: function () {
      this._animHandles = {};
      this._vm = new JSONModel({
        kpi: { dq: 0, locked: 0, jobsAttn: 0, transportOpen: 0 },
        dq: { byCategory: [], recent: [] },
        security: { byLock: [], byType: [], lockedUsers: [] },
        jobs: { health: [], byStatus: [] },
        transport: { byStatus: [], byType: [], byOwner: [], recent: [] },
        workforce: { byArea: [], byGroup: [], byPayrollArea: [] },
        workflow: { byStatus: [], recent: [] },
        action: { items: [] },
        meta: { autoRefresh: true, lastUpdatedText: "" }
      });
      this.getView().setModel(this._vm);
      this._configureCharts();
      this._loadAll();
      this._startAutoRefresh();
    },

    onExit: function () {
      // Every SetInterval needs a matching teardown - a view can be
      // destroyed/recreated (navigation, re-open) and a leaked timer would
      // keep polling a dead view's OData model.
      this._stopAutoRefresh();
      Object.keys(this._animHandles).forEach(function (sPath) {
        cancelAnimationFrame(this._animHandles[sPath]);
      });
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

    // Every donut in this app was showing the sap.viz placeholder "Title of
    // Chart" text and no value labels - the Card header already carries the
    // real title, and nothing had ever turned data labels on. One shared
    // config for all 9 VizFrames instead of repeating it per chart.
    _configureCharts: function () {
      var oProps = {
        title: { visible: false },
        legend: { visible: true },
        plotArea: { dataLabel: { visible: true, type: "value" } }
      };
      VIZ_IDS.forEach(function (sId) {
        var oViz = this.byId(sId);
        if (oViz) { oViz.setVizProperties(oProps); }
      }.bind(this));
    },

    _startAutoRefresh: function () {
      this._stopAutoRefresh();
      this._refreshTimer = setInterval(function () {
        // In-flight guard: with a 5s cadence and a growing number of reads
        // per cycle, a slow backend round-trip could otherwise let two
        // cycles overlap and pile up requests. Skipping a tick is cheap;
        // stacking requests isn't.
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
        this._buildActionCenter();
        this._refreshing = false;
        this._vm.setProperty("/meta/lastUpdatedText", new Date().toLocaleTimeString());
      }.bind(this));
    },

    // Read an OData V4 collection into a plain array of plain objects.
    // Same technique proven in Employee-360's dashboard app - bindList +
    // requestContexts, not a live table binding, so charts/tables here are
    // driven off a local JSONModel the controller builds. aFilters/aSorters
    // are optional sap.ui.model.Filter/Sorter arrays - filtering at the
    // source (not pulling everything and trimming client-side) is the same
    // discipline the CDS side already applies (BackgroundJobHealth, Duplicate
    // Employee).
    _read: function (sPath, iTop, aFilters, aSorters) {
      var oList = this.getView().getModel("odata").bindList(sPath, null, aSorters || [], aFilters || [], { $count: false });
      return oList.requestContexts(0, iTop || 2000).then(function (aCtx) {
        return aCtx.map(function (c) { return c.getObject(); });
      });
    },

    _num: function (v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; },

    // Sum a numeric field, grouped by one dimension field, across an array
    // of rows - used everywhere a summary entity has more dimensions than
    // a single chart needs (e.g. DataQualitySummary is Category x Severity,
    // charted by Category alone).
    _groupSum: function (rows, dimField, measureField) {
      var agg = {};
      rows.forEach(function (r) {
        var k = r[dimField] || "(blank)";
        agg[k] = (agg[k] || 0) + this._num(r[measureField]);
      }.bind(this));
      return Object.keys(agg).map(function (k) { return { name: k, value: agg[k] }; });
    },

    _sum: function (rows, measureField) {
      return rows.reduce(function (t, r) { return t + this._num(r[measureField]); }.bind(this), 0);
    },

    // Ease a bound KPI number from its current value to iTarget instead of
    // snapping it, so a 5-second refresh reads as "counting" rather than
    // flickering. Pure model-value interpolation - no custom rendering, so
    // it works with the standard NumericHeader binding as-is.
    _animateNumber: function (sPath, vTarget) {
      var iTarget = this._num(vTarget);
      var iStart = this._num(this._vm.getProperty(sPath));
      if (iStart === iTarget) { return; }
      if (this._animHandles[sPath]) {
        cancelAnimationFrame(this._animHandles[sPath]);
      }
      var iBegin = null;
      var step = function (ts) {
        if (iBegin === null) { iBegin = ts; }
        var p = Math.min((ts - iBegin) / ANIM_MS, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        this._vm.setProperty(sPath, Math.round(iStart + (iTarget - iStart) * eased));
        if (p < 1) {
          this._animHandles[sPath] = requestAnimationFrame(step);
        } else {
          delete this._animHandles[sPath];
        }
      }.bind(this);
      this._animHandles[sPath] = requestAnimationFrame(step);
    },

    _loadDataQuality: function () {
      return Promise.all([
        this._read("/DataQualitySummary"),
        this._read("/DataQualityIssue", 50)
      ]).then(function (res) {
        var summary = res[0], recent = res[1];
        this._vm.setProperty("/dq/byCategory", this._groupSum(summary, "Category", "IssueCount"));
        this._animateNumber("/kpi/dq", this._sum(summary, "IssueCount"));
        recent.sort(function (a, b) { return this._num(b.SeverityCriticality) - this._num(a.SeverityCriticality); }.bind(this));
        this._vm.setProperty("/dq/recent", recent.slice(0, 10));
      }.bind(this));
    },

    _loadSecurity: function () {
      return Promise.all([
        this._read("/SecuritySummary"),
        // Only locked accounts, straight from the service - a manager needs
        // the names to reach out to, not a 4,000+ row dump to scroll.
        this._read("/SecurityUser", 100, [new Filter("IsLocked", FilterOperator.EQ, "X")])
      ]).then(function (res) {
        var rows = res[0], lockedUsers = res[1];
        this._vm.setProperty("/security/byLock", this._groupSum(rows, "IsLocked", "UserCount"));
        this._vm.setProperty("/security/byType", this._groupSum(rows, "UserType", "UserCount"));
        var locked = rows.filter(function (r) { return r.IsLocked === "X"; });
        this._animateNumber("/kpi/locked", this._sum(locked, "UserCount"));
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
        this._animateNumber("/kpi/jobsAttn", this._sum(summary, "JobNameCount"));
      }.bind(this));
    },

    _loadTransport: function () {
      return Promise.all([
        this._read("/TransportSummary"),
        this._read("/TransportTypeSummary"),
        this._read("/TransportByOwner"),
        // "Don't show moved ones, only queued ones" - filter to still-open
        // statuses (D = modifiable, R = released but not yet imported) at
        // the source, newest change first, instead of showing the whole
        // history and trimming client-side.
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
        var byStatus = res[0], byType = res[1], byOwnerRaw = res[2], recent = res[3];
        this._vm.setProperty("/transport/byStatus", this._groupSum(byStatus, "RequestStatus", "RequestCount"));
        this._vm.setProperty("/transport/byType", this._groupSum(byType, "RequestType", "RequestCount"));
        this._vm.setProperty("/transport/recent", recent);
        var openOnly = byStatus.filter(function (r) { return r.RequestStatus === "D" || r.RequestStatus === "R"; });
        this._animateNumber("/kpi/transportOpen", this._sum(openOnly, "RequestCount"));

        // Manager ask (2026-09-05): "on which IDs how many TRs are left open
        // and how many moved/released" - pivot the Owner x RequestStatus
        // rows from ZC_TWR_TRANSPORT_BY_OWNER into one row per owner.
        var byOwner = {};
        byOwnerRaw.forEach(function (r) {
          var sOwner = r.Owner || "(unassigned)";
          if (!byOwner[sOwner]) { byOwner[sOwner] = { owner: sOwner, open: 0, released: 0, total: 0 }; }
          var n = this._num(r.RequestCount);
          byOwner[sOwner].total += n;
          if (r.RequestStatus === "D") { byOwner[sOwner].open += n; }
          else if (r.RequestStatus === "R") { byOwner[sOwner].released += n; }
        }.bind(this));
        var aOwnerRows = Object.keys(byOwner).map(function (k) { return byOwner[k]; });
        aOwnerRows.sort(function (a, b) { return b.open - a.open; });
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

    // The single "what needs attention, and who do I call" view a technical
    // manager actually wants, instead of six separate domains to scan one at
    // a time. Built entirely from what the six _load* functions already put
    // in the model - no extra reads. Criticality follows the Fiori Elements
    // convention already used throughout this app (1 = negative/worst,
    // 2 = warning, 3 = positive) - lower sorts first.
    _buildActionCenter: function () {
      var vm = this._vm;
      var aItems = [];

      (vm.getProperty("/dq/recent") || []).forEach(function (r) {
        aItems.push({
          domain: "Data Quality",
          item: r.EmployeeID,
          detail: [r.CheckID, r.FieldName].filter(Boolean).join(" - "),
          status: r.Severity,
          criticality: this._num(r.SeverityCriticality) || 2,
          contact: "HR Master Data Team"
        });
      }.bind(this));

      (vm.getProperty("/security/lockedUsers") || []).forEach(function (u) {
        aItems.push({
          domain: "Security",
          item: u.Username,
          detail: "Account locked (" + (u.UserType || "type n/a") + ")",
          status: "Locked",
          criticality: 1,
          contact: "Basis / Security Team"
        });
      });

      (vm.getProperty("/jobs/health") || []).forEach(function (j) {
        aItems.push({
          domain: "Background Jobs",
          item: j.JobName,
          detail: "Latest run status: " + j.Status,
          status: j.Status,
          criticality: this._num(j.StatusCriticality) || 2,
          contact: j.Owner || "Basis - Job Scheduling"
        });
      }.bind(this));

      (vm.getProperty("/transport/recent") || []).forEach(function (t) {
        aItems.push({
          domain: "Transport",
          item: t.TransportRequest,
          detail: t.RequestStatus === "D" ? "Modifiable - still with the developer" : "Released - queued for import",
          status: t.RequestStatus,
          criticality: this._num(t.StatusCriticality) || 2,
          contact: t.Owner || "-"
        });
      }.bind(this));

      (vm.getProperty("/workflow/recent") || []).forEach(function (w) {
        if (w.Status === "COMPLETED" || w.Status === "CANCELLED") { return; }
        aItems.push({
          domain: "Workflow",
          item: (w.WorkItemType || "") + " " + w.WorkItemId,
          detail: "Status: " + w.Status,
          status: w.Status,
          criticality: 2,
          contact: "Process owner - not yet mapped (needs SWWUSERWI)"
        });
      });

      aItems.sort(function (a, b) { return a.criticality - b.criticality; });
      vm.setProperty("/action/items", aItems.slice(0, 40));
    },

    _setError: function (sText) {
      var s = this.byId("errStrip");
      s.setText(sText || "");
      s.setVisible(!!sText);
    }
  });
});
