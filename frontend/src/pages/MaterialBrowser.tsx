import { useState, useCallback } from "react";
import { useQuery } from "@apollo/client/react";
import { useNavigate } from "react-router-dom";
import { GET_MATERIAL_CATALOG_FILTERS, MATERIAL_CATALOG } from "../graphql/queries";
import type { MaterialCatalogFilters, MaterialCatalogResult, MaterialCatalogRow } from "../graphql/types";
import TypeBadge from "../components/TypeBadge";
import ScrapBadge from "../components/ScrapBadge";
import Pagination from "../components/Pagination";

const PAGE_SIZE = 50;

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
  const navigate = useNavigate();

  const { data, loading, error } = useQuery<{ materialCatalog: MaterialCatalogResult }>(MATERIAL_CATALOG, {
    variables: {
      query: committed,
      materialType: activeType,
      mrpController: activeMrp,
      dateFrom,
      dateTo,
      sortBy: sortCol,
      sortDir,
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
    setOffset(0);
  }, []);

  const hasFilters = committed || activeType || activeMrp || dateFrom || dateTo;

  return (
    <div className="materials-layout">
      {/* Sidebar */}
      <aside className="materials-sidebar">

        <div>
          <h3>Date Range</h3>
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

        {hasFilters && (
          <button className="btn btn-secondary" onClick={clearFilters} style={{ marginTop: "auto" }}>
            Clear Filters
          </button>
        )}
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
                    {(["material","description","mrp_controller","material_type"] as const).map((col, i) => (
                      <th key={col} onClick={() => handleSort(col)}
                          style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                        {["Material ID","Description","MRP","Type"][i]}
                        <span style={{ marginLeft: 4, opacity: sortCol === col ? 1 : 0.25, fontSize: 11 }}>
                          {sortCol === col && sortDir === "desc" ? "▼" : "▲"}
                        </span>
                      </th>
                    ))}
                    {(["total_ordered","total_units_produced","avg_throughput_min","scrap_rate_pct","total_scrap_cost"] as const).map((col, i) => (
                      <th key={col} className="num" onClick={() => handleSort(col)}
                          style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
                        {["Total Orders","Units Produced","Avg Throughput","Scrap Rate","Scrap Cost"][i]}
                        <span style={{ marginLeft: 4, opacity: sortCol === col ? 1 : 0.25, fontSize: 11 }}>
                          {sortCol === col && sortDir === "desc" ? "▼" : "▲"}
                        </span>
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
