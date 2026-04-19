import { useState, useEffect, useRef } from "react";
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
import type { MRPReport } from "../graphql/types";

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

// ── SKRAPPY AI ────────────────────────────────────────────────────────────────

const PRESETS = [
  "Why is my scrap high?",
  "Where are my delays?",
  "What needs attention?",
  "Save me time",
  "Biggest risk today?",
  "What improved?",
];

interface Msg { role: "user" | "skrappy"; text: string; }

function renderMsg(text: string) {
  return text.split("\n\n").map((para, i) => {
    const parts = para.split("**");
    const nodes = parts.map((p, j) => j % 2 === 1 ? <strong key={j}>{p}</strong> : p);
    return <p key={i} style={{ margin: i === 0 ? 0 : "7px 0 0" }}>{nodes}</p>;
  });
}

function SkrappyMascot() {
  return (
    <svg viewBox="0 0 44 44" width="36" height="36" style={{ flexShrink: 0 }}>
      {/* Body — crumpled paper ball */}
      <circle cx="22" cy="22" r="18" fill="#FFF3CD" stroke="#D4A017" strokeWidth="1.5" />
      {/* Crumple lines */}
      <path d="M10 16 Q18 13 26 17 Q32 20 34 16" stroke="#C8961A" strokeWidth="0.9" fill="none" opacity="0.55" />
      <path d="M8 26 Q16 22 24 26 Q30 29 36 25" stroke="#C8961A" strokeWidth="0.9" fill="none" opacity="0.55" />
      <path d="M14 32 Q20 28 28 32" stroke="#C8961A" strokeWidth="0.9" fill="none" opacity="0.45" />
      {/* Eyes */}
      <ellipse cx="16" cy="19" rx="3" ry="3.2" fill="#1C2B4A" />
      <ellipse cx="28" cy="19" rx="3" ry="3.2" fill="#1C2B4A" />
      <circle cx="17.2" cy="17.8" r="1.1" fill="white" />
      <circle cx="29.2" cy="17.8" r="1.1" fill="white" />
      {/* Mischievous grin */}
      <path d="M14 28 Q22 33.5 30 28" stroke="#1C2B4A" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M27 28 Q29 29.5 30 28" stroke="#1C2B4A" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {/* Scrap bits sticking out */}
      <line x1="5" y1="14" x2="9" y2="17" stroke="#D4A017" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="4" y1="18" x2="8" y2="19" stroke="#D4A017" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="36" y1="12" x2="39" y2="15" stroke="#D4A017" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function generateResponse(input: string, report: MRPReport | undefined): string {
  if (!report) {
    return "Load an MRP controller and I'll tell you everything worth knowing. I'm practically bursting with scrap insights! 📎";
  }
  if (!report.hasProductionData) {
    return "No production data for this period. Try expanding the date range — there might be something hiding outside the window!";
  }

  const q = input.toLowerCase();
  const rate = report.scrapRatePct;
  const topCost = report.topMaterialsByCost[0];
  const topQty  = report.topMaterialsByQty[0];
  const topWC   = report.workCenterScrap[0];
  const ts      = report.timeSeries;

  const worstMonth  = ts.length ? ts.reduce((a, b) => a.scrapRatePct > b.scrapRatePct ? a : b) : null;
  const peakProd    = ts.length ? ts.reduce((a, b) => a.unitsProduced > b.unitsProduced ? a : b) : null;
  const lowProd     = ts.length ? ts.reduce((a, b) => a.unitsProduced < b.unitsProduced ? a : b) : null;
  const mid         = Math.floor(ts.length / 2);
  const firstRate   = mid > 0 ? ts.slice(0, mid).reduce((s, p) => s + p.scrapRatePct, 0) / mid : null;
  const secondRate  = mid > 0 ? ts.slice(mid).reduce((s, p) => s + p.scrapRatePct, 0) / (ts.length - mid) : null;

  if (q.includes("scrap") && (q.includes("why") || q.includes("high"))) {
    const lines: string[] = [];
    if (rate > 10) lines.push(`Your scrap rate is **${rate.toFixed(1)}%** — that's high. Let's fix it.`);
    else if (rate > 5) lines.push(`Scrap rate at **${rate.toFixed(1)}%** — not catastrophic, but worth addressing.`);
    else lines.push(`Scrap rate is **${rate.toFixed(1)}%** — actually quite decent! Still, here's where it comes from:`);
    if (topWC) lines.push(`Work center **${topWC.workCenter}** is your scrap hot spot at kr. ${fmt(topWC.scrapCost)}.`);
    if (topCost) lines.push(`Material **${topCost.material}** is the costliest: kr. ${fmt(topCost.totalScrapCost)} lost.`);
    if (worstMonth) lines.push(`Worst month was **${worstMonth.month}** at ${worstMonth.scrapRatePct.toFixed(1)}% scrap rate.`);
    return lines.join("\n\n");
  }

  if (q.includes("delay") || q.includes("behind") || q.includes("slow")) {
    if (!ts.length) return "No time data available for delays analysis. Try a wider date range.";
    const lines: string[] = [];
    if (lowProd) lines.push(`Production hit its lowest in **${lowProd.month}** — ${fmt(lowProd.unitsProduced)} units. That's when capacity was tightest.`);
    if (worstMonth && worstMonth.month !== lowProd?.month) lines.push(`**${worstMonth.month}** had the worst scrap rate (${worstMonth.scrapRatePct.toFixed(1)}%). High scrap often hides downstream delays.`);
    if (topWC) lines.push(`**${topWC.workCenter}** is the most likely bottleneck — that's where material disappears.`);
    lines.push("Tip: check the BOM Explorer for complex assemblies — high component depth usually means more opportunities for delay.");
    return lines.join("\n\n");
  }

  if (q.includes("attention") || q.includes("focus") || q.includes("important") || q.includes("what need")) {
    const lines = ["Here's where I'd focus:"];
    if (topCost && topCost.totalScrapCost > 0)
      lines.push(`**1. ${topCost.material}** — kr. ${fmt(topCost.totalScrapCost)} in scrap costs. That's your biggest money drain right now.`);
    if (topWC)
      lines.push(`**2. ${topWC.workCenter}** work center — responsible for kr. ${fmt(topWC.scrapCost)} in scrap cost.`);
    if (rate > 5)
      lines.push(`**3. Scrap rate at ${rate.toFixed(1)}%** — anything above 5% deserves a process review.`);
    if (lines.length === 1) lines.push("All looks relatively stable for this period. Expand the date range for a broader picture.");
    return lines.join("\n\n");
  }

  if (q.includes("save") && q.includes("time")) {
    const lines = ["Fastest wins for saving time:"];
    const highScrap = report.topMaterialsByQty.filter(m => m.scrapRatePct > 5);
    if (highScrap.length > 0)
      lines.push(`Fix **${highScrap[0].material}** first — high volume (${fmt(highScrap[0].totalQty)} units) *and* ${highScrap[0].scrapRatePct.toFixed(1)}% scrap. Double whammy.`);
    if (topWC)
      lines.push(`Reduce rework at **${topWC.workCenter}** — one process fix there saves kr. ${fmt(topWC.scrapCost)}.`);
    lines.push("The 'Where money is lost' table below ranks by cost — start from the top.");
    return lines.join("\n\n");
  }

  if (q.includes("risk") || q.includes("danger") || q.includes("worst")) {
    const lines: string[] = [];
    if (topCost && topCost.totalScrapCost > 0)
      lines.push(`Biggest financial risk: **${topCost.material}**\nkr. ${fmt(topCost.totalScrapCost)} already lost to scrap.${topCost.description ? `\n(${topCost.description})` : ""}`);
    if (rate > 10)
      lines.push(`At a ${rate.toFixed(1)}% scrap rate, roughly **1 in ${Math.round(100 / rate)} units** ends up as waste. That compounds fast.`);
    if (worstMonth)
      lines.push(`Watch out for **${worstMonth.month}** — historically your worst month at ${worstMonth.scrapRatePct.toFixed(1)}% scrap.`);
    if (!lines.length) return "No significant risks detected for this period. Data looks stable — good job! 🎉";
    return lines.join("\n\n");
  }

  if (q.includes("improv") || q.includes("better") || q.includes("good")) {
    if (!ts.length) return "No trend data available. Try a longer date range to spot improvements.";
    const lines: string[] = [];
    if (firstRate !== null && secondRate !== null) {
      if (secondRate < firstRate)
        lines.push(`✅ Scrap rate improved from **${firstRate.toFixed(1)}%** to **${secondRate.toFixed(1)}%** over the selected period. Keep it up!`);
      else
        lines.push(`Scrap rate moved from ${firstRate.toFixed(1)}% to ${secondRate.toFixed(1)}% — trending the wrong way. Time to investigate.`);
    }
    if (peakProd)
      lines.push(`Best production month: **${peakProd.month}** with ${fmt(peakProd.unitsProduced)} units. What went right then?`);
    return lines.join("\n\n");
  }

  // Fallback — always contextual
  const fallbacks = [
    `You've produced **${fmt(report.totalUnitsProduced)} units** with a **${rate.toFixed(1)}%** scrap rate.\n\n${topCost ? `The costliest scrap is from **${topCost.material}** at kr. ${fmt(topCost.totalScrapCost)}.` : "No scrap cost data for this period."}`,
    `I'm SKRAPPY — your scrap intelligence sidekick! Ask me about scrap rates, work centers, materials, or what needs your attention.`,
    `Total scrap cost: **kr. ${fmt(report.totalScrapCost)}**. Every krone saved is a krone earned. I know, I know — very Clippy of me.`,
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

function SkrappyChat({ report }: { report: MRPReport | undefined }) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "skrappy", text: "Hi! I'm **SKRAPPY** — your scrap intelligence sidekick. Select an MRP controller and ask me anything about your production data!" },
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMrp = useRef<string | undefined>(undefined);

  useEffect(() => {
    const controller = report?.mrpController;
    if (controller && controller !== prevMrp.current && report?.hasProductionData) {
      prevMrp.current = controller;
      const rate = report.scrapRatePct;
      const topCost = report.topMaterialsByCost[0];
      const greeting = `Loaded **${controller}**! Here's the quick take:\n\n${fmt(report.totalUnitsProduced)} units produced, ${rate.toFixed(1)}% scrap rate, kr. ${fmt(report.totalScrapCost)} in scrap costs.${topCost ? `\n\nBiggest cost driver: **${topCost.material}** at kr. ${fmt(topCost.totalScrapCost)}.` : ""}\n\nAsk me anything — or pick a prompt below!`;
      setMessages([{ role: "skrappy", text: greeting }]);
    } else if (controller && controller !== prevMrp.current && !report?.hasProductionData) {
      prevMrp.current = controller;
      setMessages([{ role: "skrappy", text: `Loaded **${controller}**, but no production orders found for this period. Try expanding the date range!` }]);
    }
  }, [report]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const response = generateResponse(trimmed, report);
    setMessages(prev => [
      ...prev,
      { role: "user", text: trimmed },
      { role: "skrappy", text: response },
    ]);
    setInput("");
  };

  return (
    <div className="skrappy-panel">
      <div className="skrappy-header">
        <SkrappyMascot />
        <div>
          <p className="skrappy-name">SKRAPPY</p>
          <p className="skrappy-subtitle">MRP Intelligence</p>
        </div>
      </div>

      <div className="skrappy-messages">
        {messages.map((m, i) => (
          <div key={i} className={`skrappy-msg skrappy-msg-${m.role}`}>
            {renderMsg(m.text)}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="skrappy-pills">
        {PRESETS.map((p) => (
          <button key={p} className="skrappy-pill" onClick={() => send(p)}>
            {p}
          </button>
        ))}
      </div>

      <div className="skrappy-input-row">
        <input
          type="text"
          className="skrappy-input"
          placeholder="Ask about your MRP area..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(input)}
        />
        <button className="skrappy-send-btn" onClick={() => send(input)} title="Send">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

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
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>

          <div className="sidebar-section">
            <p className="sidebar-section-label">Date Range</p>
            <div className="mrp-date-range">
              <label className="mrp-date-label">From</label>
              <input type="date" className="mrp-date-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <label className="mrp-date-label">To</label>
              <input type="date" className="mrp-date-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              <button className="btn btn-secondary" style={{ width: "100%", marginTop: 6 }}
                onClick={() => { setDateFrom(defaultDateFrom()); setDateTo(defaultDateTo()); }}>
                Reset to Past Year
              </button>
            </div>
          </div>

          <SkrappyChat report={report} />
        </aside>

        {/* Main content */}
        <div className="materials-main">
          {!selectedMrp && !ctrlLoading && (
            <p className="empty-state">Select an MRP controller to view the report.</p>
          )}

          {report && !report.hasProductionData && (
            <div className="mrp-no-data-banner">
              <strong>No production orders found for controller "{report.mrpController}" in selected period.</strong>
              <p>Try expanding the date range, or import production orders in <Link to="/data">Data Upload</Link>.</p>
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
                  <p className="stat-value" style={{
                    color: report.scrapRatePct > 10 ? "var(--status-red)" : report.scrapRatePct > 5 ? "var(--status-amber)" : "var(--status-green)",
                  }}>
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
                          <Area type="monotone" dataKey="unitsProduced" name="Units Produced" stroke="#2d4a8a" fill="#e8eef8" strokeWidth={2} />
                          <Area type="monotone" dataKey="scrapUnits" name="Scrap Units" stroke="var(--red)" fill="#fde8e8" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="mrp-chart-section card-section">
                      <h3 className="section-title">Scrap Rate Over Time (%)</h3>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={report.timeSeries} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(1)}%`} />
                          <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, "Scrap Rate"]} />
                          <Bar dataKey="scrapRatePct" name="Scrap Rate %" fill="var(--red)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {report.workCenterScrap.length > 0 && (
                    <div className="mrp-chart-section card-section" style={{ marginBottom: 28 }}>
                      <h3 className="section-title">Scrap Cost by Work Center</h3>
                      <ResponsiveContainer width="100%" height={Math.max(200, report.workCenterScrap.slice(0, 10).length * 28)}>
                        <BarChart data={report.workCenterScrap.slice(0, 10)} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `kr. ${(v / 1000).toFixed(0)}k`} />
                          <YAxis type="category" dataKey="workCenter" width={88} tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: number) => [fmtCost(v), "Scrap Cost"]} />
                          <Bar dataKey="scrapCost" name="Scrap Cost" fill="var(--red)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              )}

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
                            <td><Link to={`/materials/${m.material}`} className="table-link">{m.material}</Link></td>
                            <td className="text-secondary">{m.description ?? "—"}</td>
                            <td style={{ textAlign: "right" }}>{fmt(m.totalQty)}</td>
                            <td style={{ textAlign: "right", color: m.scrapQty > 0 ? "var(--red)" : undefined }}>{fmt(m.scrapQty)}</td>
                            <td style={{
                              textAlign: "right", fontWeight: 600,
                              color: m.scrapRatePct > 10 ? "var(--status-red)" : m.scrapRatePct > 5 ? "var(--status-amber)" : "var(--status-green)",
                            }}>{m.scrapRatePct.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

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
                            <td><Link to={`/materials/${m.material}`} className="table-link">{m.material}</Link></td>
                            <td className="text-secondary">{m.description ?? "—"}</td>
                            <td style={{ textAlign: "right" }}>{fmt(m.scrapUnits)}</td>
                            <td style={{ textAlign: "right", color: "var(--red)", fontWeight: 600 }}>{fmtCost(m.totalScrapCost)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {reportLoading && selectedMrp && <p className="empty-state">Loading report…</p>}
        </div>
      </div>
    </div>
  );
}
