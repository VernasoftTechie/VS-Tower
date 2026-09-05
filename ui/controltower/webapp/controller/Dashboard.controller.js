sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
  "use strict";

  return Controller.extend("vstower.controltower.controller.Dashboard", {

    onInit: function () {
      this._vm = new JSONModel({
        kpi: { dq: 0, locked: 0, jobsAttn: 0, transportOpen: 0 },
        dq: { byCategory: [], recent: [] },
        security: { byLock: [], byType: [] },
        jobs: { health: [], byStatus: [] },
        transport: { byStatus: [], byType: [], recent: [] },
        workforce: { byArea: [], byGroup: [], byPayrollArea: [] },
        workflow: { byStatus: [], recent: [] }
      });
      this.getView().setModel(this._vm);
      this._loadAll();
    },

    onRefresh: function () {
      this.getView().getModel("odata").refresh();
      this._loadAll();
    },

    _loadAll: function () {
      this._setError("");
      Promise.all([
        this._loadDataQuality(),
        this._loadSecurity(),
        this._loadJobs(),
        this._loadTransport(),
        this._loadWorkforce(),
        this._loadWorkflow()
      ]).catch(function (e) { this._setError((e && e.message) || String(e)); }.bind(this));
    },

    // Read an OData V4 collection into a plain array of plain objects.
    // Same technique proven in Employee-360's dashboard app - bindList +
    // requestContexts, not a live table binding, so charts/tables here are
    // driven off a local JSONModel the controller builds.
    _read: function (sPath, iTop) {
      var oList = this.getView().getModel("odata").bindList(sPath, null, null, [], { $count: false });
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

    _loadDataQuality: function () {
      return Promise.all([
        this._read("/DataQualitySummary"),
        this._read("/DataQualityIssue", 50)
      ]).then(function (res) {
        var summary = res[0], recent = res[1];
        this._vm.setProperty("/dq/byCategory", this._groupSum(summary, "Category", "IssueCount"));
        this._vm.setProperty("/kpi/dq", this._sum(summary, "IssueCount"));
        recent.sort(function (a, b) { return this._num(b.SeverityCriticality) - this._num(a.SeverityCriticality); }.bind(this));
        this._vm.setProperty("/dq/recent", recent.slice(0, 10));
      }.bind(this));
    },

    _loadSecurity: function () {
      return this._read("/SecuritySummary").then(function (rows) {
        this._vm.setProperty("/security/byLock", this._groupSum(rows, "IsLocked", "UserCount"));
        this._vm.setProperty("/security/byType", this._groupSum(rows, "UserType", "UserCount"));
        var locked = rows.filter(function (r) { return r.IsLocked === "X"; });
        this._vm.setProperty("/kpi/locked", this._sum(locked, "UserCount"));
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
        this._vm.setProperty("/kpi/jobsAttn", this._sum(summary, "JobNameCount"));
      }.bind(this));
    },

    _loadTransport: function () {
      return Promise.all([
        this._read("/TransportSummary"),
        this._read("/TransportTypeSummary"),
        this._read("/TransportRequestSet", 20)
      ]).then(function (res) {
        var byStatus = res[0], byType = res[1], recent = res[2];
        this._vm.setProperty("/transport/byStatus", this._groupSum(byStatus, "RequestStatus", "RequestCount"));
        this._vm.setProperty("/transport/byType", this._groupSum(byType, "RequestType", "RequestCount"));
        this._vm.setProperty("/transport/recent", recent);
        var openOnly = byStatus.filter(function (r) { return r.RequestStatus === "D" || r.RequestStatus === "R"; });
        this._vm.setProperty("/kpi/transportOpen", this._sum(openOnly, "RequestCount"));
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

    _setError: function (sText) {
      var s = this.byId("errStrip");
      s.setText(sText || "");
      s.setVisible(!!sText);
    }
  });
});
