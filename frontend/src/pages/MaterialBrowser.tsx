import { useState, useCallback } from "react";
import { useQuery } from "@apollo/client/react";
import { useNavigate } from "react-router-dom";
import { GET_MATERIAL_CATALOG_FILTERS, SEARCH_MATERIALS } from "../graphql/queries";
import type { Material, MaterialCatalogFilters, MaterialSearchResult } from "../graphql/types";
import TypeBadge from "../components/TypeBadge";

const PAGE_SIZE = 50;

const selectStyle = {
  background: "var(--bg2)",
  border: "1px solid var(--border)",
  color: "var(--text-head)",
  borderRadius: 8,
  padding: ".56rem .75rem",
  fontSize: ".85rem",
  minWidth: 170,
};

export default function MaterialBrowser() {
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [materialType, setMaterialType] = useState("");
  const [mrpController, setMrpController] = useState("");
  const [offset, setOffset] = useState(0);
  const navigate = useNavigate();

  const { data, loading, error } = useQuery<{ searchMaterials: MaterialSearchResult }>(SEARCH_MATERIALS, {
    variables: {
      query: committed,
      limit: PAGE_SIZE,
      offset,
      materialType,
      mrpController,
    },
  });

  const { data: filterData, loading: filtersLoading } = useQuery<{
    materialCatalogFilters: MaterialCatalogFilters;
  }>(GET_MATERIAL_CATALOG_FILTERS);

  const typeOptions = filterData?.materialCatalogFilters.materialTypes ?? [];
  const mrpOptions = filterData?.materialCatalogFilters.mrpControllers ?? [];

  const handleSearch = useCallback(() => {
    setOffset(0);
    setCommitted(search.trim());
  }, [search]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setCommitted("");
    setMaterialType("");
    setMrpController("");
    setOffset(0);
  }, []);

  const onTypeChange = useCallback((value: string) => {
    setMaterialType(value);
    setOffset(0);
  }, []);

  const onMrpChange = useCallback((value: string) => {
    setMrpController(value);
    setOffset(0);
  }, []);

  const items: Material[] = data?.searchMaterials.items ?? [];
  const total: number = data?.searchMaterials.total ?? 0;

  return (
    <>
      <div className="page-header"><h1>Materials</h1></div>

      <div className="card">
        <div className="search-bar">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search by material number…"
          />
          <button className="btn btn-primary" onClick={handleSearch}>Search</button>
          <select
            value={materialType}
            onChange={(e) => onTypeChange(e.target.value)}
            style={selectStyle}
            title="Filter by material type"
          >
            <option value="">All Types</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select
            value={mrpController}
            onChange={(e) => onMrpChange(e.target.value)}
            style={selectStyle}
            title="Filter by MRP controller"
          >
            <option value="">All MRP</option>
            {mrpOptions.map((mrp) => (
              <option key={mrp} value={mrp}>{mrp}</option>
            ))}
          </select>
          <button className="btn btn-ghost" onClick={clearFilters}>Reset</button>
        </div>
        {filtersLoading && (
          <div style={{ marginTop: ".6rem", color: "var(--text-muted)", fontSize: ".78rem" }}>
            Loading filter options...
          </div>
        )}
      </div>

      <div className="card">
        {error && <div className="error-msg">Error: {error.message}</div>}
        {loading && !data && <div className="spinner">Loading materials...</div>}
        {!loading && items.length === 0 && <div className="spinner">No results found.</div>}

        {(items.length > 0 || loading) && (
          <>
            <div style={{ marginBottom: ".75rem", color: "var(--text-muted)", fontSize: ".85rem" }}>
              {total.toLocaleString()} results
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Description</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((m) => (
                    <tr
                      key={m.material}
                      className="clickable"
                      onClick={() => navigate(`/materials/${m.material}`)}
                    >
                      <td><code style={{ fontFamily: "var(--mono)", fontSize: ".8rem" }}>{m.material}</code></td>
                      <td title={m.description ?? ""}>{m.description ?? "—"}</td>
                      <td><TypeBadge type={m.materialType} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination" style={{ marginTop: "1rem" }}>
              <button
                className="btn btn-ghost"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >← Prev</button>
              <span>
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total.toLocaleString()}
              </span>
              <button
                className="btn btn-ghost"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >Next →</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
