import { useState } from "react";
import { useQuery } from "@apollo/client/react";
import { useNavigate } from "react-router-dom";
import { GET_FINAL_PRODUCTS } from "../graphql/queries";
import type { FinalProduct, FinalProductsResult } from "../graphql/types";
import TypeBadge from "../components/TypeBadge";
import ScrapBadge from "../components/ScrapBadge";
import Pagination from "../components/Pagination";

const PAGE_SIZE = 50;
type SortKey = keyof FinalProduct;

export default function FinalProducts() {
  const navigate = useNavigate();
  const [search, setSearch]     = useState("");
  const [committed, setCommitted] = useState("");
  const [offset, setOffset]     = useState(0);
  const [sortKey, setSortKey]   = useState<SortKey>("scrapRatePct");
  const [sortAsc, setSortAsc]   = useState(false);

  const { data, loading, error } = useQuery<{ finalProducts: FinalProductsResult }>(GET_FINAL_PRODUCTS, {
    variables: { limit: PAGE_SIZE, offset, search: committed },
  });

  const items  = data?.finalProducts.items ?? [];
  const total  = data?.finalProducts.total ?? 0;

  function commit() { setOffset(0); setCommitted(search); }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  }

  const sorted = [...items].sort((a, b) => {
    const v1 = a[sortKey] as number | string | null | undefined;
    const v2 = b[sortKey] as number | string | null | undefined;
    const cmp = (v1 ?? 0) < (v2 ?? 0) ? -1 : (v1 ?? 0) > (v2 ?? 0) ? 1 : 0;
    return sortAsc ? cmp : -cmp;
  });

  const th = (key: SortKey, label: string) => (
    <th onClick={() => toggleSort(key)}>{label} {sortKey === key ? (sortAsc ? "▲" : "▼") : ""}</th>
  );

  return (
    <>
      <div className="page-header"><h1>Final Products</h1></div>

      <div className="card" style={{ fontSize: ".85rem", color: "var(--text-muted)" }}>
        ZFRT materials — finished goods / saleable products.{" "}
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
                    {th("material",       "Material")}
                    <th>Description</th>
                    {th("materialType",   "Type")}
                    {th("status",         "Status")}
                    {th("totalOrdered",   "Ordered")}
                    {th("totalScrap",     "Scrap")}
                    {th("scrapRatePct",   "Scrap %")}
                    {th("routingOpCount", "Ops")}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p) => (
                    <tr key={p.material} className="clickable" onClick={() => navigate(`/materials/${p.material}`)}>
                      <td><code style={{ fontFamily: "var(--mono)", fontSize: ".8rem" }}>{p.material}</code></td>
                      <td title={p.description ?? ""}>{p.description ?? "—"}</td>
                      <td><TypeBadge type={p.materialType} /></td>
                      <td style={{ color: p.status === "A" ? "var(--green)" : "var(--text-muted)" }}>
                        {p.status ?? "—"}
                      </td>
                      <td>{p.totalOrdered > 0 ? p.totalOrdered.toLocaleString() : "—"}</td>
                      <td>{p.totalScrap   > 0 ? p.totalScrap.toLocaleString()   : "—"}</td>
                      <td>{p.totalOrdered > 0 ? <ScrapBadge pct={p.scrapRatePct} /> : "—"}</td>
                      <td>{p.routingOpCount > 0 ? p.routingOpCount : "—"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: ".75rem", padding: ".2rem .6rem" }}
                          onClick={() => navigate(`/bom/${p.material}`)}
                        >
                          BOM →
                        </button>
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
