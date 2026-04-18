import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@apollo/client/react";
import { useNavigate } from "react-router-dom";
import { GET_MATERIAL_CATALOG_FILTERS, MATERIAL_CATALOG } from "../graphql/queries";
import type { MaterialCatalogFilters, MaterialCatalogResult, MaterialCatalogRow } from "../graphql/types";
import TypeBadge from "../components/TypeBadge";
import ScrapBadge from "../components/ScrapBadge";
import Pagination from "../components/Pagination";

const PAGE_SIZE = 50;

type RangeState = {
  minTotalOrders: string;
  maxTotalOrders: string;
  minUnitsProduced: string;
  maxUnitsProduced: string;
  minAvgThroughput: string;
  maxAvgThroughput: string;
  minScrapRate: string;
  maxScrapRate: string;
  minScrapCost: string;
  maxScrapCost: string;
};

const EMPTY_RANGES: RangeState = {
  minTotalOrders: "",
  maxTotalOrders: "",
  minUnitsProduced: "",
  maxUnitsProduced: "",
  minAvgThroughput: "",
  maxAvgThroughput: "",
  minScrapRate: "",
  maxScrapRate: "",
  minScrapCost: "",
  maxScrapCost: "",
};

const TEXT_COLUMNS = [
  { column: "material", label: "Material ID" },
  { column: "description", label: "Description" },
  { column: "mrp_controller", label: "MRP" },
  { column: "material_type", label: "Type" },
] as const;

const RANGE_COLUMNS = [
  { column: "total_ordered", label: "Total Orders", minKey: "minTotalOrders", maxKey: "maxTotalOrders" },
  { column: "total_units_produced", label: "Units Produced", minKey: "minUnitsProduced", maxKey: "maxUnitsProduced" },
  { column: "avg_throughput_min", label: "Avg Throughput", minKey: "minAvgThroughput", maxKey: "maxAvgThroughput" },
  { column: "scrap_rate_pct", label: "Scrap Rate", minKey: "minScrapRate", maxKey: "maxScrapRate" },
  { column: "total_scrap_cost", label: "Scrap Cost", minKey: "minScrapCost", maxKey: "maxScrapCost" },
] as const;

type RangeColumn = typeof RANGE_COLUMNS[number]["column"];

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

function fmtCost(n: number | null | undefined): string {
  if (n == null) return "—";
  return `€ ${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtThroughput(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(1)} min`;
}

export default function MaterialBrowser() {
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [activeType, setActiveType] = useState("");
  const [activeMrp, setActiveMrp] = useState("");
  const [mrpSearch, setMrpSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [sortCol, setSortCol] = useState("material");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [ranges, setRanges] = useState<RangeState>({ ...EMPTY_RANGES });
  const [openRangeColumn, setOpenRangeColumn] = useState<RangeColumn | null>(null);
  const rangePopupRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  const n = (s: string) => s !== "" ? Number(s) : null;

  const { data, loading, error } = useQuery<{ materialCatalog: MaterialCatalogResult }>(MATERIAL_CATALOG, {
    variables: {
      query: committed,
      materialType: activeType,
      mrpController: activeMrp,
      dateFrom,
      dateTo,
      sortBy: sortCol,
      sortDir,
      minTotalOrders:   n(ranges.minTotalOrders),
      maxTotalOrders:   n(ranges.maxTotalOrders),
      minUnitsProduced: n(ranges.minUnitsProduced),
      maxUnitsProduced: n(ranges.maxUnitsProduced),
      minAvgThroughput: n(ranges.minAvgThroughput),
      maxAvgThroughput: n(ranges.maxAvgThroughput),
      minScrapRate:     n(ranges.minScrapRate),
      maxScrapRate:     n(ranges.maxScrapRate),
      minScrapCost:     n(ranges.minScrapCost),
      maxScrapCost:     n(ranges.maxScrapCost),
      limit: PAGE_SIZE,
      offset,
    },
  });

  const { data: filterData } = useQuery<{ materialCatalogFilters: MaterialCatalogFilters }>(
    GET_MATERIAL_CATALOG_FILTERS
  );

  const typeOptions = filterData?.materialCatalogFilters.materialTypes ?? [];
  const allMrpOptions = filterData?.materialCatalogFilters.mrpControllers ?? [];
  const mrpOptions = mrpSearch
    ? allMrpOptions.filter(m => m.toLowerCase().includes(mrpSearch.toLowerCase()))
    : allMrpOptions;

  const rows: MaterialCatalogRow[] = data?.materialCatalog.rows ?? [];
  const total: number = data?.materialCatalog.total ?? 0;

  const handleSearch = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
    setOffset(0);
    setCommitted(search.trim());
  }, [search]);

  const selectType = useCallback((t: string) => {
    setActiveType(prev => prev === t ? "" : t);
    setOffset(0);
  }, []);

  const selectMrp = useCallback((m: string) => {
    setActiveMrp(prev => prev === m ? "" : m);
    setOffset(0);
  }, []);

  const setRange = useCallback((key: keyof RangeState, val: string) => {
    setRanges(prev => ({ ...prev, [key]: val }));
    setOffset(0);
  }, []);

  const handleSort = useCallback((col: string) => {
    if (col === sortCol) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
    setOffset(0);
  }, [sortCol]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setCommitted("");
    setActiveType("");
    setActiveMrp("");
    setMrpSearch("");
    setDateFrom("");
    setDateTo("");
    setRanges({ ...EMPTY_RANGES });
    setOpenRangeColumn(null);
    setOffset(0);
  }, []);

  const toggleRangePopup = useCallback((column: RangeColumn) => {
    setOpenRangeColumn(prev => (prev === column ? null : column));
  }, []);

  const clearSingleRange = useCallback((column: RangeColumn) => {
    const config = RANGE_COLUMNS.find(c => c.column === column);
    if (!config) return;
    setRanges(prev => ({ ...prev, [config.minKey]: "", [config.maxKey]: "" }));
    setOffset(0);
  }, []);

  useEffect(() => {
    if (!openRangeColumn) return;

    const onMouseDown = (event: MouseEvent) => {
      if (rangePopupRef.current && !rangePopupRef.current.contains(event.target as Node)) {
        setOpenRangeColumn(null);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenRangeColumn(null);
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openRangeColumn]);

  const hasFilters = committed || activeType || activeMrp || dateFrom || dateTo || Object.values(ranges).some(v => v !== "");

  return (
    <div className="materials-layout">
      {/* Sidebar */}
      <aside className="materials-sidebar">

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Date Range</h3>
            {hasFilters && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={clearFilters}
                style={{ padding: "6px 10px", fontSize: 11, letterSpacing: "0.04em" }}
              >
                Clear Filters
              </button>
            )}
          </div>
          <div className="filter-date-group">
            <div>
              <div className="filter-date-label">From</div>
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); setOffset(0); }}
              />
            </div>
            <div>
              <div className="filter-date-label">To</div>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); setOffset(0); }}
              />
            </div>
          </div>
        </div>

        <div>
          <h3>Filter by Type</h3>
          <div className="type-chips">
            {typeOptions.map(t => (
              <button
                key={t}
                className={`type-chip badge-${t}${activeType === t ? " active" : ""}`}
                onClick={() => selectType(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3>Filter by MRP</h3>
          <input
            type="text"
            placeholder="Search MRP…"
            value={mrpSearch}
            onChange={e => setMrpSearch(e.target.value)}
            style={{ marginBottom: 8, fontSize: 13, padding: "6px 10px" }}
          />
          <div className="filter-group" style={{ maxHeight: 220, overflowY: "auto" }}>
            {mrpOptions.map(m => (
              <label key={m} className="filter-checkbox">
                <input
                  type="checkbox"
                  checked={activeMrp === m}
                  onChange={() => selectMrp(m)}
                />
                {m}
              </label>
            ))}
          </div>
        </div>

      </aside>

      {/* Main content */}
      <div className="materials-main">
        <h1 style={{ margin: "0 0 24px" }}>Materials</h1>

        <form onSubmit={handleSearch}>
          <div className="search-wrap">
            <span className="search-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              className="search-input"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by material ID or description…"
            />
          </div>
        </form>

        {/* Active filter pills */}
        {(activeType || activeMrp) && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {activeType && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg-section)", border: "1px solid var(--red)", padding: "2px 10px", fontSize: 13 }}>
                Type: <strong>{activeType}</strong>
                <button onClick={() => setActiveType("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
              </span>
            )}
            {activeMrp && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--bg-section)", border: "1px solid var(--red)", padding: "2px 10px", fontSize: 13 }}>
                MRP: <strong>{activeMrp}</strong>
                <button onClick={() => setActiveMrp("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red)", padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
              </span>
            )}
          </div>
        )}

        {error && <div className="empty-state">Error: {error.message}</div>}
        {loading && !data && <div className="empty-state">Loading materials…</div>}
        {!loading && !error && rows.length === 0 && (
          <div className="empty-state">No materials found.</div>
        )}

        {(rows.length > 0 || loading) && (
          <>
            <div className="materials-meta">
              {total.toLocaleString()} material{total !== 1 ? "s" : ""}
              {(dateFrom || dateTo) && (
                <span style={{ marginLeft: 8, color: "var(--red)" }}>· date filtered</span>
              )}
            </div>

            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    {TEXT_COLUMNS.map(({ column, label }) => (
                      <th key={column} style={{ userSelect: "none", whiteSpace: "nowrap" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span>{label}</span>
                          <button
                            type="button"
                            onClick={() => handleSort(column)}
                            aria-label={`Sort by ${label}`}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "inherit",
                              cursor: "pointer",
                              padding: 0,
                              fontSize: 11,
                              opacity: sortCol === column ? 1 : 0.25,
                            }}
                          >
                            {sortCol === column && sortDir === "desc" ? "▼" : "▲"}
                          </button>
                        </div>
                      </th>
                    ))}

                    {RANGE_COLUMNS.map(({ column, label, minKey, maxKey }) => (
                      <th key={column} className="num" style={{ userSelect: "none", whiteSpace: "nowrap", position: "relative" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => toggleRangePopup(column)}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "inherit",
                              cursor: "pointer",
                              padding: 0,
                              textDecoration: "underline",
                              textUnderlineOffset: "2px",
                            }}
                          >
                            {label}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSort(column)}
                            aria-label={`Sort by ${label}`}
                            style={{
                              border: "none",
                              background: "transparent",
                              color: "inherit",
                              cursor: "pointer",
                              padding: 0,
                              fontSize: 11,
                              opacity: sortCol === column ? 1 : 0.25,
                            }}
                          >
                            {sortCol === column && sortDir === "desc" ? "▼" : "▲"}
                          </button>
                        </div>

                        {openRangeColumn === column && (
                          <div
                            ref={rangePopupRef}
                            style={{
                              position: "absolute",
                              top: "calc(100% + 8px)",
                              right: 0,
                              zIndex: 20,
                              background: "var(--white)",
                              border: "1px solid var(--border)",
                              boxShadow: "0 8px 20px rgba(0, 0, 0, 0.16)",
                              padding: 10,
                              minWidth: 210,
                            }}
                          >
                            <div style={{ color: "var(--text-secondary)", fontSize: 11, marginBottom: 8 }}>
                              {label} range
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: 6 }}>
                              <input
                                type="number"
                                min={0}
                                placeholder="min"
                                value={ranges[minKey]}
                                onChange={e => setRange(minKey, e.target.value)}
                                style={{
                                  width: "100%",
                                  fontSize: 12,
                                  padding: "4px 6px",
                                  border: "1px solid var(--border)",
                                  background: "var(--white)",
                                  color: "var(--text-body)",
                                  fontFamily: "inherit",
                                }}
                              />
                              <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>—</span>
                              <input
                                type="number"
                                min={0}
                                placeholder="max"
                                value={ranges[maxKey]}
                                onChange={e => setRange(maxKey, e.target.value)}
                                style={{
                                  width: "100%",
                                  fontSize: 12,
                                  padding: "4px 6px",
                                  border: "1px solid var(--border)",
                                  background: "var(--white)",
                                  color: "var(--text-body)",
                                  fontFamily: "inherit",
                                }}
                              />
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                              <button
                                type="button"
                                onClick={() => clearSingleRange(column)}
                                style={{
                                  border: "1px solid var(--border)",
                                  background: "transparent",
                                  color: "var(--text-body)",
                                  cursor: "pointer",
                                  fontSize: 11,
                                  padding: "4px 8px",
                                }}
                              >
                                Clear
                              </button>
                              <button
                                type="button"
                                onClick={() => setOpenRangeColumn(null)}
                                style={{
                                  border: "1px solid var(--border)",
                                  background: "transparent",
                                  color: "var(--text-body)",
                                  cursor: "pointer",
                                  fontSize: 11,
                                  padding: "4px 8px",
                                }}
                              >
                                Close
                              </button>
                            </div>
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.material} onClick={() => navigate(`/materials/${r.material}`)}>
                      <td className="mono">{r.material}</td>
                      <td className="trunc" title={r.description ?? ""}>{r.description ?? "—"}</td>
                      <td>{r.mrpController ?? "—"}</td>
                      <td><TypeBadge type={r.materialType} /></td>
                      <td className="num">{fmt(r.totalOrdered)}</td>
                      <td className="num">{fmt(r.totalUnitsProduced)}</td>
                      <td className="num">{fmtThroughput(r.avgThroughputMin)}</td>
                      <td className="num">
                        {r.scrapRatePct != null ? <ScrapBadge pct={r.scrapRatePct} /> : "—"}
                      </td>
                      <td className="num">{fmtCost(r.totalScrapCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination offset={offset} pageSize={PAGE_SIZE} total={total} onPage={setOffset} />
          </>
        )}
      </div>
    </div>
  );
}
