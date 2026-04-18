import { useState } from "react";
import { useQuery } from "@apollo/client/react";
import { useNavigate } from "react-router-dom";
import { GET_RAW_MATERIALS } from "../graphql/queries";
import type { RawMaterial, RawMaterialsResult } from "../graphql/types";
import TypeBadge from "../components/TypeBadge";
import Pagination from "../components/Pagination";

const PAGE_SIZE = 50;

export default function RawMaterials() {
  const navigate = useNavigate();
  const [search, setSearch]       = useState("");
  const [committed, setCommitted] = useState("");
  const [offset, setOffset]       = useState(0);
  const [sortAsc, setSortAsc]     = useState(false);

  const { data, loading, error } = useQuery<{ rawMaterials: RawMaterialsResult }>(GET_RAW_MATERIALS, {
    variables: { limit: PAGE_SIZE, offset, search: committed },
  });

  const items = data?.rawMaterials.items ?? [];
  const total = data?.rawMaterials.total ?? 0;

  function commit() { setOffset(0); setCommitted(search); }

  const sorted = [...items].sort((a, b) =>
    sortAsc ? a.usedInBomCount - b.usedInBomCount : b.usedInBomCount - a.usedInBomCount
  );

  return (
    <>
      <div className="page-header"><h1>Raw / Purchased Materials</h1></div>

      <div className="card" style={{ fontSize: ".85rem", color: "var(--text-muted)" }}>
        Components with no BOM and no routing — must be purchased externally. Sorted by dependency count (bottleneck risk).{" "}
        {total > 0 && <strong style={{ color: "var(--text-head)" }}>{total.toLocaleString()} total</strong>}
      </div>

      <div className="card">
        <div className="search-bar" style={{ marginBottom: ".75rem" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            placeholder="Filter by ID or description…"
          />
          <button className="btn btn-primary" onClick={commit}>Search</button>
          {committed && (
            <button className="btn btn-ghost" onClick={() => { setSearch(""); setCommitted(""); setOffset(0); }}>
              Clear
            </button>
          )}
        </div>

        {loading && <div className="spinner">Loading…</div>}
        {error   && <div className="error-msg">{error.message}</div>}

        {!loading && (
          <>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Material</th>
                    <th>Description</th>
                    <th>Type</th>
                    <th
                      onClick={() => setSortAsc(!sortAsc)}
                      style={{ cursor: "pointer" }}
                    >
                      Used in # BOMs {sortAsc ? "▲" : "▼"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((m: RawMaterial) => (
                    <tr key={m.material} className="clickable" onClick={() => navigate(`/materials/${m.material}`)}>
                      <td><code style={{ fontFamily: "var(--mono)", fontSize: ".8rem" }}>{m.material}</code></td>
                      <td title={m.description ?? ""}>{m.description ?? "—"}</td>
                      <td><TypeBadge type={m.materialType} /></td>
                      <td>
                        <span style={{
                          color:      m.usedInBomCount > 100 ? "var(--red)" :
                                      m.usedInBomCount > 20  ? "var(--yellow)" : "var(--text)",
                          fontWeight: m.usedInBomCount > 20 ? 700 : 400,
                        }}>
                          {m.usedInBomCount.toLocaleString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination offset={offset} pageSize={PAGE_SIZE} total={total} onPage={setOffset} />
          </>
        )}
      </div>
    </>
  );
}
