import { useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@apollo/client/react";
import {
  GET_MATERIAL, GET_ROUTING, GET_BOM_CHILDREN,
  GET_MATERIAL_SCRAP, GET_MATERIAL_SCRAP_TIME_SERIES,
} from "../graphql/queries";
import type {
  Material, RoutingOperation, BomItem,
  MaterialScrapTimeSeries,
} from "../graphql/types";
import TypeBadge from "../components/TypeBadge";
import ScrapBadge from "../components/ScrapBadge";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

type BomSortCol =
  | "component" | "description" | "materialType"
  | "quantity"  | "unit"        | "itemCategory"
  | "hasChildren" | "scrapRatePct" | "totalScrapCost";

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MaterialDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const materialId = id!;

  // BOM children sort state
  const [sortBy,  setSortBy]  = useState<BomSortCol>("component");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Scrap info panel year filter
  const [scrapYear, setScrapYear] = useState<number | null>(null);

  const { data: mData, loading: mLoad } = useQuery<{ material: Material | null }>(GET_MATERIAL, {
    variables: { materialId },
  });
  const { data: rData, loading: rLoad } = useQuery<{ routing: RoutingOperation[] }>(GET_ROUTING, {
    variables: { materialId },
  });
  const { data: bData } = useQuery<{ bomChildren: BomItem[] }>(GET_BOM_CHILDREN, {
    variables: { materialId },
  });
  const { data: scrapData } = useQuery<{
    materialScrap: {
      totalOrdered: number;
      totalScrap: number;
      totalDelivered: number;
      scrapRatePct: number;
      totalScrapCost?: number | null;
      avgThroughputMin?: number | null;
    } | null;
  }>(GET_MATERIAL_SCRAP, { variables: { materialId } });

  const { data: tsData } = useQuery<{ materialScrapTimeSeries: MaterialScrapTimeSeries | null }>(
    GET_MATERIAL_SCRAP_TIME_SERIES,
    { variables: { materialId, year: scrapYear ?? undefined } },
  );

  const children = bData?.bomChildren ?? [];

  // ── Sorted BOM children (must be before any early returns) ──────────────────
  const sortedChildren = useMemo(() => {
    return [...children].sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (sortBy) {
        case "component":      av = a.component;              bv = b.component;              break;
        case "description":    av = a.description ?? "";      bv = b.description ?? "";      break;
        case "materialType":   av = a.materialType ?? "";     bv = b.materialType ?? "";     break;
        case "quantity":       av = a.quantity;               bv = b.quantity;               break;
        case "unit":           av = a.unit;                   bv = b.unit;                   break;
        case "itemCategory":   av = a.itemCategory;           bv = b.itemCategory;           break;
        case "hasChildren":    av = a.hasChildren ? 1 : 0;    bv = b.hasChildren ? 1 : 0;    break;
        case "scrapRatePct":   av = a.scrapRatePct  ?? -1;    bv = b.scrapRatePct  ?? -1;    break;
        case "totalScrapCost": av = a.totalScrapCost ?? -1;   bv = b.totalScrapCost ?? -1;   break;
        default:               av = a.component;              bv = b.component;
      }
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [children, sortBy, sortDir]);

  const ts = tsData?.materialScrapTimeSeries;

  // Build a 12-month series so the chart always shows Jan..Dec for the selected year.
  const monthlyScrapRateSeries = useMemo(() => {
    if (!ts) return [] as Array<{ month: string; scrapRate: number }>;
    const byMonth = new Map<number, number>();
    for (const m of ts.monthlyData) {
      byMonth.set(m.month, Number(m.scrapRatePct.toFixed(2)));
    }
    return MONTH_NAMES.map((label, idx) => ({
      month: label,
      scrapRate: byMonth.get(idx + 1) ?? 0,
    }));
  }, [ts]);

  // ── Early returns (after all hooks) ─────────────────────────────────────────

  if (mLoad) return <div className="spinner">Loading…</div>;
  const mat = mData?.material;
  if (!mat) return <div className="error-msg">Material not found: {materialId}</div>;

  const ops   = rData?.routing ?? [];
  const scrap = scrapData?.materialScrap;

  const totalMachine = ops.reduce((s, o) => s + (o.machineMin ?? 0), 0);
  const totalLabor   = ops.reduce((s, o) => s + (o.laborMin  ?? 0), 0);

  const handleBomSort = (col: BomSortCol) => {
    if (sortBy === col) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="page-header">
        <button className="btn btn-ghost" onClick={() => navigate(-1)}>← Back</button>
        <h1 style={{ fontFamily: "var(--mono)", fontSize: "1.3rem" }}>{mat.material}</h1>
        <TypeBadge type={mat.materialType} />
      </div>

      {/* Overview card — static fields + scrap stats */}
      <div className="card" style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
        <Info label="Description"    value={mat.description} />
        <Info label="Group"          value={mat.materialGroup} />
        <Info label="Plant"          value={mat.plant} />
        <Info label="Weight"         value={mat.weightKg != null ? `${mat.weightKg} kg` : undefined} />
        <Info label="MRP Controller"  value={mat.mrpController} />
        <Info label="Status"         value={mat.status} />
        <Info label="Has BOM"        value={mat.hasBom ? "Yes" : "No"} />
        <Info label="Has Routing"    value={mat.hasRouting ? "Yes" : "No"} />
        {scrap && (
          <>
            <Info label="Total Ordered"   value={scrap.totalOrdered.toLocaleString()} />
            <Info label="Units Produced"  value={scrap.totalDelivered.toLocaleString()} />
            <Info label="Avg Throughput"  value={scrap.avgThroughputMin != null ? `${scrap.avgThroughputMin.toFixed(1)} min` : undefined} />
            <Info label="Scrap Cost"      value={scrap.totalScrapCost != null ? `${scrap.totalScrapCost.toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr.` : undefined} />
            <div>
              <div style={{ fontSize: ".75rem", color: "var(--text-muted)", marginBottom: ".2rem" }}>Scrap Rate</div>
              <ScrapBadge pct={scrap.scrapRatePct} />
            </div>
          </>
        )}
      </div>

      {/* BOM children */}
      {mat.hasBom && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".75rem" }}>
            <h3>BOM — Direct Components ({children.length})</h3>
            <Link to={`/bom/${mat.material}`} className="btn btn-ghost" style={{ fontSize: ".8rem", padding: ".3rem .8rem" }}>
              Full BOM Explorer →
            </Link>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <SortTh col="component"      label="Component"   active={sortBy} dir={sortDir} onClick={handleBomSort} />
                  <SortTh col="description"    label="Description" active={sortBy} dir={sortDir} onClick={handleBomSort} />
                  <SortTh col="materialType"   label="Type"        active={sortBy} dir={sortDir} onClick={handleBomSort} />
                  <SortTh col="quantity"       label="Qty"         active={sortBy} dir={sortDir} onClick={handleBomSort} />
                  <SortTh col="unit"           label="Unit"        active={sortBy} dir={sortDir} onClick={handleBomSort} />
                  <SortTh col="itemCategory"   label="Cat"         active={sortBy} dir={sortDir} onClick={handleBomSort} />
                  <SortTh col="hasChildren"    label="Has BOM"     active={sortBy} dir={sortDir} onClick={handleBomSort} />
                  <SortTh col="scrapRatePct"   label="Scrap Rate"  active={sortBy} dir={sortDir} onClick={handleBomSort} />
                  <SortTh col="totalScrapCost" label="Scrap Cost"  active={sortBy} dir={sortDir} onClick={handleBomSort} />
                </tr>
              </thead>
              <tbody>
                {sortedChildren.map((c) => (
                  <tr key={c.component} className="clickable" onClick={() => navigate(`/materials/${c.component}`)}>
                    <td><code style={{ fontFamily: "var(--mono)", fontSize: ".8rem" }}>{c.component}</code></td>
                    <td title={c.description ?? ""}>{c.description ?? "—"}</td>
                    <td><TypeBadge type={c.materialType} /></td>
                    <td>{c.quantity.toFixed(3)}</td>
                    <td>{c.unit}</td>
                    <td>{c.itemCategory}</td>
                    <td>{c.hasChildren ? "✓" : ""}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {c.scrapRatePct != null ? <ScrapBadge pct={c.scrapRatePct} /> : "—"}
                    </td>
                    <td>{c.totalScrapCost != null ? `${c.totalScrapCost.toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr.` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Routing operations */}
      {mat.hasRouting && (
        <div className="card">
          <h3 style={{ marginBottom: ".75rem" }}>
            Routing Operations ({ops.length}) —
            Machine: <span style={{ color: "var(--accent)" }}>{totalMachine.toFixed(1)} min</span> |
            Labor: <span style={{ color: "var(--green)" }}>{totalLabor.toFixed(1)} min</span>
          </h3>
          {rLoad ? <div className="spinner">Loading routing…</div> : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>#</th><th>Description</th><th>WC</th><th>Key</th><th>Machine</th><th>Labor</th><th>Setup</th></tr>
                </thead>
                <tbody>
                  {ops.map((op, i) => (
                    <tr key={i}>
                      <td>{op.sequence}</td>
                      <td>{op.description ?? "—"}</td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: ".8rem" }}>{op.wcId ?? "—"}</td>
                      <td>{op.crtlKey ?? "—"}</td>
                      <td>{op.machineMin != null ? <span className="time-pill machine">{op.machineMin.toFixed(2)} min</span> : "—"}</td>
                      <td>{op.laborMin  != null ? <span className="time-pill labor">{op.laborMin.toFixed(2)} min</span>  : "—"}</td>
                      <td>{op.setupMin  != null ? <span className="time-pill setup">{op.setupMin.toFixed(2)} min</span>  : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Scrap info panel */}
      {ts && (
        <ScrapInfoPanel
          data={ts}
          selectedYear={scrapYear}
          onYearChange={setScrapYear}
        />
      )}
    </>
  );
}

// ── Helper components ─────────────────────────────────────────────────────────

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: ".75rem", color: "var(--text-muted)", marginBottom: ".15rem" }}>{label}</div>
      <div style={{ fontWeight: 600, color: "var(--text-head)" }}>{value ?? "—"}</div>
    </div>
  );
}

function SortTh({
  col, label, active, dir, onClick,
}: {
  col: BomSortCol; label: string;
  active: BomSortCol; dir: "asc" | "desc";
  onClick: (col: BomSortCol) => void;
}) {
  const isActive = col === active;
  return (
    <th
      style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
      onClick={() => onClick(col)}
    >
      {label}{" "}
      <span style={{ opacity: isActive ? 1 : 0.3, fontSize: ".7rem" }}>
        {isActive ? (dir === "asc" ? "▲" : "▼") : "⇅"}
      </span>
    </th>
  );
}

// ── Scrap Info Panel ──────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function ScrapInfoPanel({
  data,
  selectedYear,
  onYearChange,
}: {
  data: MaterialScrapTimeSeries;
  selectedYear: number | null;
  onYearChange: (y: number | null) => void;
}) {
  const displayYear = selectedYear ?? data.year;

  const monthlyByMonth = new Map<number, (typeof data.monthlyData)[number]>();
  for (const row of data.monthlyData) {
    monthlyByMonth.set(row.month, row);
  }

  const monthlyChartData = MONTH_NAMES.map((name, idx) => {
    const month = idx + 1;
    const m = monthlyByMonth.get(month);
    const totalOrdered = m?.totalOrdered ?? 0;
    const totalScrap = m?.totalScrap ?? 0;
    const confirmedYield = m?.confirmedYield ?? Math.max(0, totalOrdered - totalScrap);

    return {
      name,
      scrapRate: Number((m?.scrapRatePct ?? 0).toFixed(2)),
      yield: confirmedYield,
      scrap: totalScrap,
    };
  });

  const dailyChartData = data.dailyData.map((d) => ({
    date: d.date,
    scrapRate: parseFloat(d.scrapRatePct.toFixed(2)),
  }));

  return (
    <div className="card">
      {/* Section header + year selector */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
        <h3 style={{ margin: 0 }}>Scrap Analysis</h3>
        {data.availableYears.length > 0 && (
          <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: ".75rem", padding: ".25rem .65rem", opacity: selectedYear === null ? 1 : 0.5 }}
              onClick={() => onYearChange(null)}
            >
              All
            </button>
            {data.availableYears.map((y) => (
              <button
                key={y}
                className="btn btn-ghost"
                style={{ fontSize: ".75rem", padding: ".25rem .65rem", opacity: displayYear === y ? 1 : 0.5 }}
                onClick={() => onYearChange(y)}
              >
                {y}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Summary row */}
      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap", marginBottom: "1.75rem" }}>
        <div>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--red)", lineHeight: 1.1 }}>
            {data.totalScrapCost.toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr.
          </div>
          <div style={{ fontSize: ".78rem", color: "var(--text-muted)", marginTop: ".25rem" }}>
            Total scrap cost {displayYear ? `(${displayYear})` : ""}
          </div>
        </div>
        <div style={{ fontSize: ".88rem", color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text)", fontFamily: "var(--mono)" }}>
            {data.totalScrap.toLocaleString()}
          </strong>{" "}
          units scrapped out of{" "}
          <strong style={{ color: "var(--text)", fontFamily: "var(--mono)" }}>
            {data.totalOrdered.toLocaleString()}
          </strong>{" "}
          produced
        </div>
        <div>
          <div style={{ fontSize: ".75rem", color: "var(--text-muted)", marginBottom: ".2rem" }}>Scrap Rate</div>
          <ScrapBadge pct={data.scrapRatePct} />
        </div>
      </div>

      {/* Charts grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>

        {/* Monthly scrap rate line chart */}
        {monthlyChartData.length > 0 && (
          <div>
            <h4 style={{ margin: "0 0 .5rem", fontSize: ".85rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>
              Monthly Scrap Rate
            </h4>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={monthlyChartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}%`} width={44} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [`${Number(value ?? 0).toFixed(2)}%`, "Scrap Rate"]} />
                <Line type="monotone" dataKey="scrapRate" stroke="var(--red)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Daily scrap rate (throughput vs scrap rate over time) */}
        {dailyChartData.length > 0 && (
          <div>
            <h4 style={{ margin: "0 0 .5rem", fontSize: ".85rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>
              Daily Scrap Rate
            </h4>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={dailyChartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis tickFormatter={(v: number) => `${v.toFixed(0)}%`} width={44} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => [`${Number(value ?? 0).toFixed(2)}%`, "Scrap Rate"]} />
                <Line type="monotone" dataKey="scrapRate" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Monthly stacked bar: yield (green) + scrap (red) */}
        {monthlyChartData.length > 0 && (
          <div>
            <h4 style={{ margin: "0 0 .5rem", fontSize: ".85rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>
              Monthly Production vs Scrap
            </h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyChartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend iconSize={10} wrapperStyle={{ fontSize: ".78rem" }} />
                <Bar dataKey="yield" name="Yield"  stackId="a" fill="#22c55e" />
                <Bar dataKey="scrap" name="Scrap"  stackId="a" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Failure reasons table */}
        {data.scrapReasons.length > 0 && (
          <div>
            <h4 style={{ margin: "0 0 .5rem", fontSize: ".85rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>
              Top Failure Reasons
            </h4>
            <div className="data-table-wrap" style={{ maxHeight: 200, overflowY: "auto" }}>
              <table className="data-table" style={{ fontSize: ".78rem" }}>
                <thead>
                  <tr>
                    <th>Reason</th>
                    <th style={{ textAlign: "right" }}>Records</th>
                    <th style={{ textAlign: "right" }}>Units Scrapped</th>
                  </tr>
                </thead>
                <tbody>
                  {data.scrapReasons.map((r, i) => (
                    <tr key={i}>
                      <td>{r.reason}</td>
                      <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{r.count.toLocaleString()}</td>
                      <td style={{ textAlign: "right", fontFamily: "var(--mono)", color: "var(--red)", fontWeight: 600 }}>
                        {r.unitsScrapped.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
