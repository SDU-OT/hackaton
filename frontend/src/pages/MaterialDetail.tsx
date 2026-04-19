import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@apollo/client/react";
import {
  GET_MATERIAL, GET_ROUTING, GET_BOM_CHILDREN,
  GET_MATERIAL_SCRAP, GET_MATERIAL_SCRAP_TIME_SERIES,
  MATERIAL_CATALOG,
} from "../graphql/queries";
import type {
  Material, RoutingOperation, BomItem,
  MaterialScrapTimeSeries, MaterialCatalogRow,
} from "../graphql/types";
import TypeBadge from "../components/TypeBadge";
import ScrapBadge from "../components/ScrapBadge";
import Pagination from "../components/Pagination";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";

const SCRAP_REASON_COLORS = [
  "#E2001A", "#E67E22", "#F39C12", "#27AE60",
  "#2D4A8A", "#7A5C20", "#8A2D5A", "#2D6A6A",
];

// ── Types ─────────────────────────────────────────────────────────────────────

type BomSortCol =
  | "component" | "description" | "materialType"
  | "quantity"  | "adjustedQuantity" | "unit" | "itemCategory"
  | "hasChildren" | "scrapRatePct" | "totalScrapCost";

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MaterialDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const materialId = id!;

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [compareId,   setCompareId]   = useState<string | null>(null);

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/materials");
  };

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
        case "adjustedQuantity": {
          const aScrap = a.scrapRatePct ?? 0;
          const bScrap = b.scrapRatePct ?? 0;
          av = a.quantity * (1 + aScrap / 100);
          bv = b.quantity * (1 + bScrap / 100);
          break;
        }
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

  if (compareMode) {
    return (
      <>
        <div className="page-header">
          <button className="btn btn-ghost" onClick={() => navigate(-1)}>← Back</button>
          <h1 style={{ fontFamily: "var(--mono)", fontSize: "1.3rem" }}>{mat.material}</h1>
          <TypeBadge type={mat.materialType} />
          <button
            className="btn btn-secondary"
            style={{ marginLeft: "auto" }}
            onClick={() => { setCompareMode(false); setCompareId(null); }}
          >
            ✕ Exit Compare
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem", padding: "0 2rem" }}>
          <div style={{ minWidth: 0, height: "calc(100vh - 180px)", overflowY: "auto", paddingRight: 4 }}>
            <MaterialCompareColumn materialId={materialId} />
          </div>
          <div style={{ minWidth: 0, height: "calc(100vh - 180px)", overflowY: "auto", paddingRight: 4 }}>
            {compareId
              ? <MaterialCompareColumn materialId={compareId} onClear={() => setCompareId(null)} />
              : <CompareSearchBox exclude={materialId} onSelect={setCompareId} />
            }
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header material-detail-header">
        <button className="btn material-back-btn" type="button" onClick={handleBack}>
          <span className="material-back-btn-arrow" aria-hidden="true">&lt;</span>
          <span>Back to Materials</span>
        </button>
        <div className="material-detail-title-wrap">
          <div className="material-detail-kicker">Material View</div>
          <div className="material-detail-title-row">
            <h1 className="material-detail-title">{mat.material}</h1>
            <TypeBadge type={mat.materialType} />
            <button
              className="btn btn-secondary"
              style={{ marginLeft: "auto" }}
              onClick={() => setCompareMode(true)}
              title="Compare this material side by side with another"
            >
              ⇄ Compare
            </button>
          </div>
          <p className="material-detail-subtitle">
            Information about this material and the components used to produce it.
          </p>
        </div>
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
                  <SortTh col="quantity"         label="Ideal Qty"   active={sortBy} dir={sortDir} onClick={handleBomSort} />
                  <SortTh col="adjustedQuantity" label="Actual Qty"  active={sortBy} dir={sortDir} onClick={handleBomSort} />
                  <SortTh col="unit"           label="Unit"        active={sortBy} dir={sortDir} onClick={handleBomSort} />
                  <SortTh col="itemCategory"   label="Cat"         active={sortBy} dir={sortDir} onClick={handleBomSort} />
                  <SortTh col="hasChildren"    label="Has BOM"     active={sortBy} dir={sortDir} onClick={handleBomSort} />
                  <SortTh col="scrapRatePct"   label="Scrap Rate"  active={sortBy} dir={sortDir} onClick={handleBomSort} />
                  <SortTh col="totalScrapCost" label="Scrap Cost"  active={sortBy} dir={sortDir} onClick={handleBomSort} />
                </tr>
              </thead>
              <tbody>
                {sortedChildren.map((c) => (
                  <BomRow key={c.component} item={c} depth={0} />
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

// ── Compare: search box ───────────────────────────────────────────────────────

function fmt(n: number | null | undefined) { return n == null ? "—" : n.toLocaleString("en-US"); }
function fmtCost(n: number | null | undefined) { return n == null ? "—" : `${n.toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr.`; }
function fmtTp(n: number | null | undefined) { return n == null ? "—" : `${n.toFixed(1)} min`; }

// Maps frontend column key → backend snake_case column name (same as MaterialBrowser)
const CATALOG_COL_MAP: Record<string, string> = {
  material:           "material",
  description:        "description",
  mrpController:      "mrp_controller",
  materialType:       "material_type",
  totalOrdered:       "total_ordered",
  totalUnitsProduced: "total_units_produced",
  avgThroughputMin:   "avg_throughput_min",
  scrapRatePct:       "scrap_rate_pct",
  totalScrapCost:     "total_scrap_cost",
};

type CatalogSortCol = keyof typeof CATALOG_COL_MAP;

const COMPARE_PAGE_SIZE = 15;

function CompareSearchBox({ exclude, onSelect }: { exclude: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sortCol, setSortCol] = useState<CatalogSortCol>("material");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [offset, setOffset] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { setDebounced(query); setOffset(0); }, 280);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  const { data, loading } = useQuery<{ materialCatalog: { rows: MaterialCatalogRow[]; total: number } }>(MATERIAL_CATALOG, {
    variables: {
      query: debounced,
      limit: COMPARE_PAGE_SIZE,
      offset,
      sortBy: CATALOG_COL_MAP[sortCol],
      sortDir,
      minUnitsProduced: 1,
    },
  });

  const handleSort = (col: CatalogSortCol) => {
    if (col === sortCol) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
    setOffset(0);
  };

  const rows = (data?.materialCatalog.rows ?? []).filter(r => r.material !== exclude);
  const total = data?.materialCatalog.total ?? 0;

  const Th = ({ col, label, numeric }: { col: CatalogSortCol; label: string; numeric?: boolean }) => (
    <th className={numeric ? "num" : undefined} style={{ userSelect: "none", whiteSpace: "nowrap", cursor: "pointer" }} onClick={() => handleSort(col)}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        <span style={{ fontSize: 10, opacity: sortCol === col ? 1 : 0.25 }}>
          {sortCol === col && sortDir === "desc" ? "▼" : "▲"}
        </span>
      </span>
    </th>
  );

  return (
    <div className="card" style={{ minHeight: 260 }}>
      <h3 style={{ marginBottom: ".75rem", fontSize: "1rem" }}>Select a material to compare</h3>

      <div className="search-wrap" style={{ marginBottom: ".75rem" }}>
        <span className="search-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <input
          autoFocus
          className="search-input"
          placeholder="Search by material ID or description…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </div>

      {loading && <div style={{ fontSize: ".8rem", color: "var(--text-secondary)" }}>Searching…</div>}

      {rows.length > 0 && (
        <div className="data-table-wrap" style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <Th col="material"          label="Material ID" />
                <Th col="description"       label="Description" />
                <Th col="mrpController"     label="MRP" />
                <Th col="materialType"      label="Type" />
                <Th col="totalOrdered"      label="Total Orders"    numeric />
                <Th col="totalUnitsProduced" label="Units Produced" numeric />
                <Th col="avgThroughputMin"  label="Avg Throughput"  numeric />
                <Th col="scrapRatePct"      label="Scrap Rate"      numeric />
                <Th col="totalScrapCost"    label="Scrap Cost"      numeric />
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.material} className="clickable" onClick={() => onSelect(r.material)}>
                  <td className="mono">{r.material}</td>
                  <td className="trunc" title={r.description ?? ""}>{r.description ?? "—"}</td>
                  <td>{r.mrpController ?? "—"}</td>
                  <td><TypeBadge type={r.materialType} /></td>
                  <td className="num">{fmt(r.totalOrdered)}</td>
                  <td className="num">{fmt(r.totalUnitsProduced)}</td>
                  <td className="num">{fmtTp(r.avgThroughputMin)}</td>
                  <td className="num">{r.scrapRatePct != null ? <ScrapBadge pct={r.scrapRatePct} /> : "—"}</td>
                  <td className="num">{fmtCost(r.totalScrapCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <Pagination offset={offset} pageSize={COMPARE_PAGE_SIZE} total={total} onPage={setOffset} />
      )}

      {debounced.length > 0 && !loading && rows.length === 0 && (
        <div style={{ fontSize: ".8rem", color: "var(--text-secondary)" }}>No results found.</div>
      )}
    </div>
  );
}

// ── Compare: material column ──────────────────────────────────────────────────

function MaterialCompareColumn({ materialId, onClear }: { materialId: string; onClear?: () => void }) {
  const [scrapYear, setScrapYear] = useState<number | null>(null);

  const { data: mData, loading: mLoad } = useQuery<{ material: Material | null }>(GET_MATERIAL, { variables: { materialId } });
  const { data: bData } = useQuery<{ bomChildren: BomItem[] }>(GET_BOM_CHILDREN, { variables: { materialId } });
  const { data: rData } = useQuery<{ routing: RoutingOperation[] }>(GET_ROUTING, { variables: { materialId } });
  const { data: scrapData } = useQuery<{
    materialScrap: { totalOrdered: number; totalScrap: number; totalDelivered: number; scrapRatePct: number; totalScrapCost?: number | null; avgThroughputMin?: number | null } | null;
  }>(GET_MATERIAL_SCRAP, { variables: { materialId } });
  const { data: tsData } = useQuery<{ materialScrapTimeSeries: MaterialScrapTimeSeries | null }>(
    GET_MATERIAL_SCRAP_TIME_SERIES,
    { variables: { materialId, year: scrapYear ?? undefined } },
  );

  if (mLoad) return <div className="card"><div className="spinner">Loading…</div></div>;
  const mat = mData?.material;
  if (!mat) return <div className="card" style={{ color: "var(--red)" }}>Material not found.</div>;

  const children = bData?.bomChildren ?? [];
  const ops      = rData?.routing ?? [];
  const scrap    = scrapData?.materialScrap;
  const ts       = tsData?.materialScrapTimeSeries;
  const totalMachine = ops.reduce((s, o) => s + (o.machineMin ?? 0), 0);
  const totalLabor   = ops.reduce((s, o) => s + (o.laborMin  ?? 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Header */}
      <div className="card" style={{ paddingBottom: ".75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".6rem", marginBottom: ".75rem" }}>
          <span style={{ fontFamily: "var(--mono)", fontWeight: 700, fontSize: "1.05rem" }}>{mat.material}</span>
          <TypeBadge type={mat.materialType} />
          {onClear && (
            <button
              className="btn btn-ghost"
              style={{ marginLeft: "auto", fontSize: ".75rem", padding: ".2rem .6rem" }}
              onClick={onClear}
              title="Change comparison material"
            >
              ⇄ Change
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
          <Info label="Description"   value={mat.description} />
          <Info label="Group"         value={mat.materialGroup} />
          <Info label="Plant"         value={mat.plant} />
          <Info label="MRP Controller" value={mat.mrpController} />
          <Info label="Weight"        value={mat.weightKg != null ? `${mat.weightKg} kg` : undefined} />
          <Info label="Status"        value={mat.status} />
          <Info label="Has BOM"       value={mat.hasBom ? "Yes" : "No"} />
          <Info label="Has Routing"   value={mat.hasRouting ? "Yes" : "No"} />
        </div>
      </div>

      {/* Scrap stats */}
      {scrap && (
        <div className="card">
          <h4 style={{ margin: "0 0 .65rem", fontSize: ".85rem", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-secondary)" }}>Scrap Stats</h4>
          <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
            <Info label="Total Ordered"  value={scrap.totalOrdered.toLocaleString()} />
            <Info label="Units Produced" value={scrap.totalDelivered.toLocaleString()} />
            <Info label="Avg Throughput" value={scrap.avgThroughputMin != null ? `${scrap.avgThroughputMin.toFixed(1)} min` : undefined} />
            <Info label="Scrap Cost"     value={scrap.totalScrapCost != null ? `${scrap.totalScrapCost.toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr.` : undefined} />
            <div>
              <div style={{ fontSize: ".75rem", color: "var(--text-muted)", marginBottom: ".2rem" }}>Scrap Rate</div>
              <ScrapBadge pct={scrap.scrapRatePct} />
            </div>
          </div>
        </div>
      )}

      {/* BOM children */}
      {mat.hasBom && (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".6rem" }}>
            <h4 style={{ margin: 0, fontSize: ".85rem", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-secondary)" }}>
              BOM — {children.length} components
            </h4>
            <Link to={`/bom/${mat.material}`} className="btn btn-ghost" style={{ fontSize: ".75rem", padding: ".2rem .6rem" }}>
              Full BOM →
            </Link>
          </div>
          <div className="data-table-wrap" style={{ maxHeight: 220, overflowY: "auto" }}>
            <table className="data-table" style={{ fontSize: ".78rem" }}>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Description</th>
                  <th style={{ textAlign: "right" }}>Ideal Qty</th>
                  <th style={{ textAlign: "right" }}>Actual Qty</th>
                </tr>
              </thead>
              <tbody>
                {children.map(c => {
                  const actualQty = c.quantity * (1 + (c.scrapRatePct ?? 0) / 100);
                  const isHigher  = actualQty > c.quantity;
                  return (
                    <tr key={c.component}>
                      <td><code style={{ fontFamily: "var(--mono)", fontSize: ".75rem" }}>{c.component}</code></td>
                      <td style={{ color: "var(--text-secondary)" }}>{c.description ?? "—"}</td>
                      <td style={{ textAlign: "right" }}>{c.quantity.toFixed(3)}</td>
                      <td style={{ textAlign: "right", color: isHigher ? "var(--red)" : undefined, fontWeight: isHigher ? 600 : undefined }}>
                        {isHigher ? `${actualQty.toFixed(3)} (${c.scrapRatePct!.toFixed(1)}%)` : c.quantity.toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Routing summary */}
      {mat.hasRouting && ops.length > 0 && (
        <div className="card">
          <h4 style={{ margin: "0 0 .65rem", fontSize: ".85rem", textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-secondary)" }}>
            Routing — {ops.length} operations
          </h4>
          <div style={{ display: "flex", gap: "1.5rem", marginBottom: ".65rem" }}>
            <Info label="Total Machine" value={`${totalMachine.toFixed(1)} min`} />
            <Info label="Total Labor"   value={`${totalLabor.toFixed(1)} min`} />
          </div>
          <div className="data-table-wrap" style={{ maxHeight: 160, overflowY: "auto" }}>
            <table className="data-table" style={{ fontSize: ".78rem" }}>
              <thead><tr><th>#</th><th>Description</th><th>WC</th><th>Machine</th><th>Labor</th></tr></thead>
              <tbody>
                {ops.map((op, i) => (
                  <tr key={i}>
                    <td>{op.sequence}</td>
                    <td>{op.description ?? "—"}</td>
                    <td style={{ fontFamily: "var(--mono)", fontSize: ".75rem" }}>{op.wcId ?? "—"}</td>
                    <td>{op.machineMin != null ? <span className="time-pill machine">{op.machineMin.toFixed(1)} min</span> : "—"}</td>
                    <td>{op.laborMin  != null ? <span className="time-pill labor">{op.laborMin.toFixed(1)} min</span>  : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Scrap charts */}
      {ts && (
        <ScrapInfoPanel
          data={ts}
          selectedYear={scrapYear}
          onYearChange={setScrapYear}
        />
      )}
    </div>
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

// ── BOM Row (recursive, expandable) ──────────────────────────────────────────

const BOM_DEPTH_COLORS = ["#2D4A8A", "#27AE60", "#7A5C20", "#8A2D5A", "#2D6A6A"];
const BOM_DEPTH_BG     = ["#EFF3FA", "#EFF8F2", "#FAF5EC", "#FAF0F6", "#EFF8F8"];

function BomRow({ item, depth }: { item: BomItem; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const { data, loading } = useQuery<{ bomChildren: BomItem[] }>(GET_BOM_CHILDREN, {
    variables: { materialId: item.component },
    skip: !expanded || !item.hasChildren,
  });

  const adjQty = item.quantity * (1 + (item.scrapRatePct ?? 0) / 100);
  const indent = depth * 24;
  const depthColor = BOM_DEPTH_COLORS[depth % BOM_DEPTH_COLORS.length];
  const depthBg    = depth > 0 ? BOM_DEPTH_BG[(depth - 1) % BOM_DEPTH_BG.length] : undefined;

  return (
    <>
      <tr style={{ borderLeft: depth > 0 ? `3px solid ${depthColor}` : undefined, background: depthBg }}>
        <td>
          <span style={{ display: "inline-flex", alignItems: "center", gap: ".25rem", paddingLeft: indent }}>
            {item.hasChildren ? (
              <button
                onClick={() => setExpanded((v) => !v)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: ".8rem", padding: "0 .15rem", lineHeight: 1 }}
                title={expanded ? "Collapse" : "Expand ingredients"}
              >
                {expanded ? "▾" : "▸"}
              </button>
            ) : (
              <span style={{ display: "inline-block", width: "1rem" }} />
            )}
            <code
              style={{ fontFamily: "var(--mono)", fontSize: ".8rem", cursor: "pointer", color: "var(--accent)" }}
              onClick={() => navigate(`/materials/${item.component}`)}
              title="Open material detail"
            >
              {item.component}
            </code>
          </span>
        </td>
        <td title={item.description ?? ""}>{item.description ?? "—"}</td>
        <td><TypeBadge type={item.materialType} /></td>
        <td style={{ textAlign: "right", fontFamily: "var(--mono)" }}>{item.quantity.toFixed(3)}</td>
        <td style={{ textAlign: "right", fontFamily: "var(--mono)", color: item.scrapRatePct ? "var(--orange)" : undefined }}>
          {adjQty.toFixed(3)}
        </td>
        <td>{item.unit}</td>
        <td>{item.itemCategory}</td>
        <td style={{ textAlign: "center" }}>{item.hasChildren ? "✓" : ""}</td>
        <td>{item.scrapRatePct != null ? <ScrapBadge pct={item.scrapRatePct} /> : "—"}</td>
        <td>{item.totalScrapCost != null ? `${item.totalScrapCost.toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr.` : "—"}</td>
      </tr>
      {expanded && loading && (
        <tr style={{ background: BOM_DEPTH_BG[depth % BOM_DEPTH_BG.length], borderLeft: `3px solid ${BOM_DEPTH_COLORS[depth % BOM_DEPTH_COLORS.length]}` }}>
          <td colSpan={10} style={{ paddingLeft: indent + 28, color: "var(--text-muted)", fontSize: ".8rem" }}>
            Loading…
          </td>
        </tr>
      )}
      {expanded && data?.bomChildren.map((child) => (
        <BomRow key={child.component} item={child} depth={depth + 1} />
      ))}
    </>
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
                <Bar dataKey="yield" name="Yield"  stackId="a" fill="#27AE60" />
                <Bar dataKey="scrap" name="Scrap"  stackId="a" fill="#E2001A" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Failure reasons pie chart + table */}
        {data.scrapReasons.length > 0 && (
          <div>
            <h4 style={{ margin: "0 0 .5rem", fontSize: ".85rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".05em" }}>
              Scrap by Failure Reason
            </h4>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.scrapReasons}
                  dataKey="unitsScrapped"
                  nameKey="reason"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ percent }: { percent?: number }) =>
                    (percent ?? 0) > 0.05 ? `${((percent ?? 0) * 100).toFixed(0)}%` : ""
                  }
                  labelLine={false}
                >
                  {data.scrapReasons.map((_r, i) => (
                    <Cell key={i} fill={SCRAP_REASON_COLORS[i % SCRAP_REASON_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => [
                    Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 }),
                    "Units Scrapped",
                  ]}
                  contentStyle={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8 }}
                />
                <Legend iconSize={10} wrapperStyle={{ fontSize: ".75rem" }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="data-table-wrap" style={{ maxHeight: 160, overflowY: "auto", marginTop: ".5rem" }}>
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
                      <td style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: SCRAP_REASON_COLORS[i % SCRAP_REASON_COLORS.length], flexShrink: 0 }} />
                        {r.reason}
                      </td>
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
