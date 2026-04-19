import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@apollo/client/react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { GET_MRP_CONTROLLERS, GET_MRP_REPORT } from "../graphql/queries";
import type { MRPReport, MRPClippyInsight } from "../graphql/types";

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtCost(n: number) {
  return `kr. ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function defaultDateFrom(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

function defaultDateTo(): string {
  return new Date().toISOString().slice(0, 10);
}

function ClippyPanel({ insights }: { insights: MRPClippyInsight[] }) {
  if (!insights.length) return null;
  return (
    <div className="clippy-panel">
      <p className="sidebar-section-label">Insights</p>
      {insights.map((ins, i) => (
        <div key={i} className={`clippy-insight clippy-${ins.severity}`}>
          <span className="clippy-icon">
            {ins.severity === "critical" ? "!" : ins.severity === "warning" ? "▲" : "i"}
          </span>
          <p>{ins.message}</p>
        </div>
      ))}
    </div>
  );
}

export default function MRPView() {
  const [selectedMrp, setSelectedMrp] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>(defaultDateFrom());
  const [dateTo, setDateTo]     = useState<string>(defaultDateTo());

  const { data: ctrlData, loading: ctrlLoading } = useQuery<{
    mrpControllers: string[];
  }>(GET_MRP_CONTROLLERS);

  const { data: reportData, loading: reportLoading } = useQuery<{
    mrpReport: MRPReport;
  }>(GET_MRP_REPORT, {
    variables: { mrpController: selectedMrp, dateFrom, dateTo },
    skip: !selectedMrp,
  });

  useEffect(() => {
    if (!selectedMrp && ctrlData?.mrpControllers?.length) {
      setSelectedMrp(ctrlData.mrpControllers[0]);
    }
  }, [ctrlData, selectedMrp]);

  const controllers = ctrlData?.mrpControllers ?? [];
  const report = reportData?.mrpReport;

  return (
    <div className="page-inner">
      <h1 className="page-title">MRP Dashboard</h1>

      <div className="materials-layout">
        {/* Sidebar */}
        <aside className="materials-sidebar">
          <div className="sidebar-section">
            <p className="sidebar-section-label">MRP Controller</p>
            {ctrlLoading ? (
              <p className="empty-state">Loading…</p>
            ) : controllers.length === 0 ? (
              <p className="empty-state">
                No MRP controllers found. Import production data in{" "}
                <Link to="/data">Data Upload</Link>.
              </p>
            ) : (
              <select
                className="mrp-controller-select"
                value={selectedMrp}
                onChange={(e) => setSelectedMrp(e.target.value)}
              >
                {controllers.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="sidebar-section">
            <p className="sidebar-section-label">Date Range</p>
            <div className="mrp-date-range">
              <label className="mrp-date-label">From</label>
              <input
                type="date"
                className="mrp-date-input"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <label className="mrp-date-label">To</label>
              <input
                type="date"
                className="mrp-date-input"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
              <button
                className="btn btn-secondary"
                style={{ width: "100%", marginTop: 6 }}
                onClick={() => { setDateFrom(defaultDateFrom()); setDateTo(defaultDateTo()); }}
              >
                Reset to Past Year
              </button>
            </div>
          </div>

          {report && <ClippyPanel insights={report.clippyInsights} />}
        </aside>

        {/* Main content */}
        <div className="materials-main">
          {!selectedMrp && !ctrlLoading && (
            <p className="empty-state">Select an MRP controller to view the report.</p>
          )}

          {report && !report.hasProductionData && (
            <div className="mrp-no-data-banner">
              <strong>No production orders found for controller "{report.mrpController}" in selected period.</strong>
              <p>
                Try expanding the date range, or import production orders in{" "}
                <Link to="/data">Data Upload</Link>.
              </p>
            </div>
          )}

          {report && (
            <>
              {/* KPI cards */}
              <div className="stat-grid" style={{ marginBottom: 28 }}>
                <div className="stat-card">
                  <p className="stat-label">Units Produced</p>
                  <p className="stat-value">{fmt(report.totalUnitsProduced)}</p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Scrap Units</p>
                  <p className="stat-value" style={{ color: report.totalScrapUnits > 0 ? "var(--red)" : undefined }}>
                    {fmt(report.totalScrapUnits)}
                  </p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Scrap Rate</p>
                  <p
                    className="stat-value"
                    style={{
                      color:
                        report.scrapRatePct > 10
                          ? "var(--status-red)"
                          : report.scrapRatePct > 5
                          ? "var(--status-amber)"
                          : "var(--status-green)",
                    }}
                  >
                    {report.scrapRatePct.toFixed(1)}%
                  </p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Scrap Cost</p>
                  <p className="stat-value" style={{ color: report.totalScrapCost > 0 ? "var(--red)" : undefined }}>
                    {fmtCost(report.totalScrapCost)}
                  </p>
                </div>
              </div>

              {report.timeSeries.length > 0 && (
                <>
                  {/* Production over time chart */}
                  <div className="mrp-charts-row">
                    <div className="mrp-chart-section card-section">
                      <h3 className="section-title">Production Over Time</h3>
                      <ResponsiveContainer width="100%" height={240}>
                        <AreaChart data={report.timeSeries} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmt(v)} />
                          <Tooltip formatter={(v: number) => fmt(v)} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Area
                            type="monotone"
                            dataKey="unitsProduced"
                            name="Units Produced"
                            stroke="#2d4a8a"
                            fill="#e8eef8"
                            strokeWidth={2}
                          />
                          <Area
                            type="monotone"
                            dataKey="scrapUnits"
                            name="Scrap Units"
                            stroke="var(--red)"
                            fill="#fde8e8"
                            strokeWidth={2}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Scrap rate over time bar chart */}
                    <div className="mrp-chart-section card-section">
                      <h3 className="section-title">Scrap Rate Over Time (%)</h3>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={report.timeSeries} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => `${v.toFixed(1)}%`}
                          />
                          <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, "Scrap Rate"]} />
                          <Bar dataKey="scrapRatePct" name="Scrap Rate %" fill="var(--red)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Work center scrap cost */}
                  {report.workCenterScrap.length > 0 && (
                    <div className="mrp-chart-section card-section" style={{ marginBottom: 28 }}>
                      <h3 className="section-title">Scrap Cost by Work Center</h3>
                      <ResponsiveContainer width="100%" height={Math.max(200, report.workCenterScrap.slice(0, 10).length * 28)}>
                        <BarChart
                          data={report.workCenterScrap.slice(0, 10)}
                          layout="vertical"
                          margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis
                            type="number"
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => `kr. ${(v / 1000).toFixed(0)}k`}
                          />
                          <YAxis
                            type="category"
                            dataKey="workCenter"
                            width={88}
                            tick={{ fontSize: 10 }}
                          />
                          <Tooltip
                            formatter={(v: number) => [fmtCost(v), "Scrap Cost"]}
                          />
                          <Bar dataKey="scrapCost" name="Scrap Cost" fill="var(--red)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}

              {/* Top materials by quantity */}
              {report.topMaterialsByQty.length > 0 && (
                <div className="mrp-chart-section">
                  <h3 className="section-title">Most Used Materials (by Qty)</h3>
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th>Description</th>
                          <th style={{ textAlign: "right" }}>Total Qty</th>
                          <th style={{ textAlign: "right" }}>Scrap Qty</th>
                          <th style={{ textAlign: "right" }}>Scrap Rate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.topMaterialsByQty.map((m) => (
                          <tr key={m.material}>
                            <td>
                              <Link to={`/materials/${m.material}`} className="table-link">
                                {m.material}
                              </Link>
                            </td>
                            <td className="text-secondary">{m.description ?? "—"}</td>
                            <td style={{ textAlign: "right" }}>{fmt(m.totalQty)}</td>
                            <td style={{ textAlign: "right", color: m.scrapQty > 0 ? "var(--red)" : undefined }}>
                              {fmt(m.scrapQty)}
                            </td>
                            <td
                              style={{
                                textAlign: "right",
                                color:
                                  m.scrapRatePct > 10
                                    ? "var(--status-red)"
                                    : m.scrapRatePct > 5
                                    ? "var(--status-amber)"
                                    : "var(--status-green)",
                                fontWeight: 600,
                              }}
                            >
                              {m.scrapRatePct.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Top materials by scrap cost */}
              {report.topMaterialsByCost.length > 0 && (
                <div className="mrp-chart-section">
                  <h3 className="section-title">Where Most Money Is Lost (Scrap Cost)</h3>
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th>Description</th>
                          <th style={{ textAlign: "right" }}>Scrap Units</th>
                          <th style={{ textAlign: "right" }}>Total Scrap Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.topMaterialsByCost.map((m) => (
                          <tr key={m.material}>
                            <td>
                              <Link to={`/materials/${m.material}`} className="table-link">
                                {m.material}
                              </Link>
                            </td>
                            <td className="text-secondary">{m.description ?? "—"}</td>
                            <td style={{ textAlign: "right" }}>{fmt(m.scrapUnits)}</td>
                            <td style={{ textAlign: "right", color: "var(--red)", fontWeight: 600 }}>
                              {fmtCost(m.totalScrapCost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {reportLoading && selectedMrp && (
            <p className="empty-state">Loading report…</p>
          )}
        </div>
      </div>
    </div>
  );
}
