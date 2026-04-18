import { useState } from "react";
import { useQuery } from "@apollo/client/react";
import { Sankey, Tooltip, ResponsiveContainer } from "recharts";
import { GET_AGGREGATE_SCRAP_SANKEY, GET_SCRAP_STATS, GET_SCRAP_CHAIN } from "../graphql/queries";
import type { ScrapSankeyData, ScrapStat, ScrapChainItem } from "../graphql/types";
import ScrapBadge from "../components/ScrapBadge";

function formatMin(min: number) {
  if (!min || min === 0) return "—";
  if (min < 60) return `${min.toFixed(1)} min`;
  return `${(min / 60).toFixed(2)} h`;
}

export default function ScrapExplorer() {
  const [chainMaterial, setChainMaterial] = useState<string | null>(null);

  const { data: sankeyData, loading: sankeyLoading } = useQuery<{
    aggregateScrapSankey: ScrapSankeyData;
  }>(GET_AGGREGATE_SCRAP_SANKEY);

  const { data: scrapData, loading: scrapLoading } = useQuery<{
    scrapStats: ScrapStat[];
  }>(GET_SCRAP_STATS, { variables: { limit: 200 } });

  const { data: chainData, loading: chainLoading } = useQuery<{
    scrapChain: ScrapChainItem[];
  }>(GET_SCRAP_CHAIN, {
    variables: { materialId: chainMaterial },
    skip: !chainMaterial,
  });

  const sankey = sankeyData?.aggregateScrapSankey;
  const stats   = scrapData?.scrapStats ?? [];
  const chain   = chainData?.scrapChain ?? [];
  const hasData = stats.length > 0;
  const hasCosts = stats.some((s) => s.totalScrapCost != null && s.totalScrapCost > 0);

  // Build Recharts-compatible Sankey data
  const sankeyChartData = sankey && sankey.nodes.length > 0
    ? {
        nodes: sankey.nodes.map((n) => ({ name: n.label })),
        links: sankey.links.map((l) => {
          const si = sankey.nodes.findIndex((n) => n.id === l.source);
          const ti = sankey.nodes.findIndex((n) => n.id === l.target);
          return { source: si, target: ti, value: l.value };
        }).filter((l) => l.source >= 0 && l.target >= 0 && l.source !== l.target),
      }
    : null;

  return (
    <>
      <div className="page-header"><h1>Scrap Explorer</h1></div>

      {!hasData && !scrapLoading && (
        <div className="card" style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "2rem", marginBottom: ".5rem" }}>⚠</div>
          <strong>No scrap data loaded.</strong>
          <p style={{ marginTop: ".4rem", fontSize: ".88rem" }}>
            Scrap.xlsx is loaded automatically at startup. If you see this, the file may be missing or empty.
            You can also import a scrap CSV in{" "}
            <a href="/data" style={{ color: "var(--accent)" }}>Data Management</a>.
          </p>
        </div>
      )}

      {/* Sankey diagram */}
      {hasData && (
        <div className="card">
          <h3 style={{ marginBottom: ".8rem" }}>Aggregate Scrap Flow (BOM-level)</h3>
          {sankeyLoading && <div className="spinner">Building Sankey…</div>}
          {sankeyChartData && sankeyChartData.links.length > 0 ? (
            <ResponsiveContainer width="100%" height={500}>
              <Sankey
                data={sankeyChartData}
                nodePadding={12}
                margin={{ top: 8, right: 140, bottom: 8, left: 8 }}
                link={{ stroke: "var(--accent)", strokeOpacity: 0.22 }}
              >
                <Tooltip
                  formatter={(value: number) => [value.toLocaleString(undefined, { maximumFractionDigits: 2 }), "Quantity wasted"]}
                />
              </Sankey>
            </ResponsiveContainer>
          ) : (
            !sankeyLoading && <div style={{ color: "var(--text-muted)", fontSize: ".88rem" }}>No Sankey data available.</div>
          )}
        </div>
      )}

      {/* Scrap stats table */}
      {hasData && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <h3 style={{ marginBottom: ".8rem" }}>Scrap by Material</h3>
          {scrapLoading && <div className="spinner">Loading…</div>}
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Ordered</th>
                  <th>Scrapped</th>
                  <th>Delivered</th>
                  <th>Scrap %</th>
                  {hasCosts && <th>Std. price</th>}
                  {hasCosts && <th>Total scrap cost</th>}
                  <th>Scrap Chain</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.material}>
                    <td style={{ fontFamily: "var(--mono)", fontSize: ".8rem" }}>{s.material}</td>
                    <td title={s.description ?? ""}>{s.description ?? "—"}</td>
                    <td>{s.materialType ?? "—"}</td>
                    <td>{s.totalOrdered.toLocaleString()}</td>
                    <td style={{ color: s.totalScrap > 0 ? "var(--red)" : undefined }}>
                      {s.totalScrap.toLocaleString()}
                    </td>
                    <td>{s.totalDelivered.toLocaleString()}</td>
                    <td><ScrapBadge pct={s.scrapRatePct} /></td>
                    {hasCosts && (
                      <td style={{ fontFamily: "var(--mono)", fontSize: ".8rem" }}>
                        {s.avgStdPrice != null ? s.avgStdPrice.toFixed(2) : "—"}
                      </td>
                    )}
                    {hasCosts && (
                      <td style={{ fontFamily: "var(--mono)", fontSize: ".8rem", color: s.totalScrapCost && s.totalScrapCost > 0 ? "var(--red)" : undefined }}>
                        {s.totalScrapCost != null && s.totalScrapCost > 0
                          ? s.totalScrapCost.toLocaleString(undefined, { maximumFractionDigits: 2 })
                          : "—"}
                      </td>
                    )}
                    <td>
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: ".75rem", padding: ".2rem .6rem" }}
                        onClick={() => setChainMaterial(chainMaterial === s.material ? null : s.material)}
                      >
                        {chainMaterial === s.material ? "Hide" : "View chain"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Scrap chain detail */}
      {chainMaterial && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: ".8rem" }}>
            <h3 style={{ margin: 0 }}>Scrap Chain: {chainMaterial}</h3>
            <button className="btn btn-ghost" style={{ fontSize: ".8rem" }} onClick={() => setChainMaterial(null)}>
              Close
            </button>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: ".83rem", marginBottom: ".8rem" }}>
            Components consumed to produce scrapped units of <strong>{chainMaterial}</strong>.
            Quantities and time are multiplied by total scrap count.
          </p>
          {chainLoading && <div className="spinner">Loading chain…</div>}
          {!chainLoading && chain.length === 0 && (
            <div style={{ color: "var(--text-muted)", fontSize: ".88rem" }}>
              No BOM chain found for this material (no scrap recorded or BOM not available).
            </div>
          )}
          {chain.length > 0 && (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Depth</th>
                    <th>Component</th>
                    <th>Description</th>
                    <th>Qty / scrapped unit</th>
                    <th>Total qty wasted</th>
                    <th>Machine time wasted</th>
                    <th>Labor time wasted</th>
                    <th>Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {chain.map((item, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: "var(--mono)" }}>{item.depth}</td>
                      <td style={{ fontFamily: "var(--mono)", fontSize: ".8rem" }}>{item.component}</td>
                      <td title={item.description ?? ""}>{item.description ?? "—"}</td>
                      <td>{item.qtyPerScrappedUnit.toFixed(4)}</td>
                      <td style={{ color: "var(--red)", fontWeight: 600 }}>
                        {item.totalQtyWasted.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td>{formatMin(item.machineMinWasted)}</td>
                      <td>{formatMin(item.laborMinWasted)}</td>
                      <td>
                        {item.estimatedCost != null
                          ? item.estimatedCost.toLocaleString(undefined, { maximumFractionDigits: 2 })
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
