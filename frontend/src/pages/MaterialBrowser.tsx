import { useState, useCallback } from "react";
import { useQuery } from "@apollo/client/react";
import { useNavigate } from "react-router-dom";
import { SEARCH_MATERIALS } from "../graphql/queries";
import type { Material, MaterialSearchResult } from "../graphql/types";
import TypeBadge from "../components/TypeBadge";

const PAGE_SIZE = 30;

export default function MaterialBrowser() {
  const [search, setSearch] = useState("");
  const [committed, setCommitted] = useState("");
  const [offset, setOffset] = useState(0);
  const navigate = useNavigate();

  const { data, loading } = useQuery<{ searchMaterials: MaterialSearchResult }>(SEARCH_MATERIALS, {
    variables: { query: committed, limit: PAGE_SIZE, offset },
    skip: committed.length < 1,
  });

  const handleSearch = useCallback(() => {
    setOffset(0);
    setCommitted(search);
  }, [search]);

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
            placeholder="Search by material ID or description…"
          />
          <button className="btn btn-primary" onClick={handleSearch}>Search</button>
        </div>
      </div>

      {committed && (
        <div className="card">
          {loading && <div className="spinner">Searching…</div>}
          {!loading && items.length === 0 && <div className="spinner">No results found.</div>}
          {!loading && items.length > 0 && (
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
                      <th>Group</th>
                      <th>Status</th>
                      <th>BOM</th>
                      <th>Routing</th>
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
                        <td>{m.materialGroup ?? "—"}</td>
                        <td style={{ color: m.status === "A" ? "var(--green)" : "var(--text-muted)" }}>
                          {m.status ?? "—"}
                        </td>
                        <td>{m.hasBom ? "✓" : ""}</td>
                        <td>{m.hasRouting ? "✓" : ""}</td>
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
      )}

      {!committed && (
        <div className="card spinner">Type a material ID or description and press Search or Enter.</div>
      )}
    </>
  );
}
