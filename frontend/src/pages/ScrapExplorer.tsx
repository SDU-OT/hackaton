import { useState } from "react";
import { useQuery } from "@apollo/client/react";
import { Sankey, Tooltip, ResponsiveContainer } from "recharts";
import {
  GET_AGGREGATE_SCRAP_SANKEY,
  GET_SCRAP_STATS,
  GET_SCRAP_CHAIN,
  GET_SCRAP_YEARS,
} from "../graphql/queries";
import type { ScrapSankeyData, ScrapStat, ScrapChainItem } from "../graphql/types";
import ScrapBadge from "../components/ScrapBadge";

const SANKEY_NODE_PALETTE = [
  "#324568",
  "#2f4f5f",
  "#4f4d79",
  "#3c5578",
  "#4e5d72",
  "#355b63",
];

type SankeyNodeRenderProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  payload?: {
    name?: string;
  };
};

type SankeyTooltipEntry = {
  name?: string;
  value?: unknown;
  payload?: {
    name?: string;
    source?: { name?: string };
    target?: { name?: string };
  };
};

type SankeyTooltipProps = {
  active?: boolean;
  payload?: SankeyTooltipEntry[];
};

function formatMin(min: number) {
  if (!min || min === 0) return "—";
  if (min < 60) return `${min.toFixed(1)} min`;
  return `${(min / 60).toFixed(2)} h`;
}

function formatSankeyValue(value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function buildSankeyNodeLabel(partNumber: string, description: string): string {
  const pn = (partNumber ?? "").trim();
  const desc = (description ?? "").trim();

  if (!pn && !desc) return "—";
  if (!pn) return desc;
  if (!desc) return pn;
  if (desc.toLowerCase().includes(pn.toLowerCase())) return desc;
  return `${pn} - ${desc}`;
}

function renderSankeyNode(
  props: SankeyNodeRenderProps,
  onHoverLabel?: (label: string | null) => void,
) {
  const x = props.x ?? 0;
  const y = props.y ?? 0;
  const width = Math.max(1, props.width ?? 0);
  const height = Math.max(1, props.height ?? 0);
  const index = props.index ?? 0;

  const rawName = typeof props.payload?.name === "string" ? props.payload.name : "—";
  const fill = SANKEY_NODE_PALETTE[index % SANKEY_NODE_PALETTE.length];

  return (
    <g
      className="custom-sankey-node"
      onMouseEnter={() => onHoverLabel?.(rawName)}
      onMouseLeave={() => onHoverLabel?.(null)}
      style={{ cursor: "pointer" }}
    >
      <title>{rawName}</title>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={3}
        ry={3}
        fill={fill}
        stroke="#9cb8f5"
        strokeWidth={1.1}
      />
    </g>
  );
}

function renderSankeyTooltip({ active, payload }: SankeyTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const entry = payload[0];
  const raw = entry.payload;
  const sourceName = raw?.source?.name;
  const targetName = raw?.target?.name;
  const nodeName = raw?.name ?? entry.name ?? "Part";
  const title = sourceName && targetName ? `${sourceName} -> ${targetName}` : nodeName;

  return (
    <div className="sankey-tooltip">
      <div className="sankey-tooltip-title">{title}</div>
      <div className="sankey-tooltip-value">Quantity wasted: {formatSankeyValue(entry.value)}</div>
    </div>
  );
}

export default function ScrapExplorer() {
  const [chainMaterial, setChainMaterial] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [hoveredSankeyLabel, setHoveredSankeyLabel] = useState<string | null>(null);

  const { data: yearsData } = useQuery<{ scrapYears: number[] }>(GET_SCRAP_YEARS);
  const years = yearsData?.scrapYears ?? [];

  const { data: sankeyData, loading: sankeyLoading } = useQuery<{
    aggregateScrapSankey: ScrapSankeyData;
  }>(GET_AGGREGATE_SCRAP_SANKEY, {
    variables: { year: selectedYear },
  });

  const { data: scrapData, loading: scrapLoading } = useQuery<{
    scrapStats: ScrapStat[];
  }>(GET_SCRAP_STATS, { variables: { limit: 200, year: selectedYear } });

  const { data: chainData, loading: chainLoading } = useQuery<{
    scrapChain: ScrapChainItem[];
  }>(GET_SCRAP_CHAIN, {
    variables: { materialId: chainMaterial },
    skip: !chainMaterial,
  });

  const sankey  = sankeyData?.aggregateScrapSankey;
  const stats   = scrapData?.scrapStats ?? [];
  const chain   = chainData?.scrapChain ?? [];
  const hasData = stats.length > 0;
  const hasCosts = stats.some((s) => s.totalScrapCost != null && s.totalScrapCost > 0);

  // Build Recharts-compatible Sankey data
  const sankeyChartData = sankey && sankey.nodes.length > 0
    ? {
        nodes: sankey.nodes.map((n, i) => ({
          name: buildSankeyNodeLabel(n.id, n.label),
          fill: SANKEY_NODE_PALETTE[i % SANKEY_NODE_PALETTE.length],
        })),
        links: sankey.links.map((l) => {
          const si = sankey.nodes.findIndex((n) => n.id === l.source);
          const ti = sankey.nodes.findIndex((n) => n.id === l.target);
          return { source: si, target: ti, value: l.value };
        }).filter((l) => l.source >= 0 && l.target >= 0 && l.source !== l.target),
      }
    : null;

  return (
    <>
      <div className="page-header" style={{ display: "flex", alignItems: "center", gap: "1.5rem", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Scrap Explorer</h1>

        {/* Year filter */}
        <div style={{ display: "flex", alignItems: "center", gap: ".5rem", marginLeft: "auto" }}>
          <label style={{ fontSize: ".85rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            Filter by year:
          </label>
          <select
            value={selectedYear ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedYear(v === "" ? null : parseInt(v, 10));
              setChainMaterial(null);
            }}
            style={{
              padding: ".3rem .6rem",
              borderRadius: "6px",
              border: "1px solid var(--border)",
              background: "var(--bg2)",
              color: "var(--text)",
              fontSize: ".85rem",
              cursor: "pointer",
            }}
          >
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {selectedYear && (
            <button
              className="btn btn-ghost"
              style={{ fontSize: ".8rem", padding: ".25rem .5rem" }}
              onClick={() => { setSelectedYear(null); setChainMaterial(null); }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {!hasData && !scrapLoading && (
        <div className="card" style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
          <div style={{ fontSize: "2rem", marginBottom: ".5rem" }}>⚠</div>
          <strong>No scrap data{selectedYear ? ` for ${selectedYear}` : " loaded"}.</strong>
          <p style={{ marginTop: ".4rem", fontSize: ".88rem" }}>
            {selectedYear
              ? `No scrap records found for ${selectedYear}. Try a different year or clear the filter.`
              : "Scrap.xlsx is loaded automatically at startup. If you see this, the file may be missing or empty. You can also import a scrap CSV in "}
            {!selectedYear && (
              <a href="/data" style={{ color: "var(--accent)" }}>Data Management</a>
            )}
            {!selectedYear && "."}
          </p>
        </div>
      )}

      {/* Sankey diagram */}
      {hasData && (
        <div className="card">
          <h3 style={{ marginBottom: ".8rem" }}>
            Aggregate Scrap Flow (top 15 materials × BOM)
            {selectedYear && <span style={{ marginLeft: ".6rem", fontSize: ".8rem", color: "var(--text-muted)", fontWeight: 400 }}>{selectedYear}</span>}
          </h3>
          {sankeyLoading && <div className="spinner">Building Sankey…</div>}
          {sankeyChartData && sankeyChartData.links.length > 0 ? (
            <div
              className="scrap-sankey-wrap"
              role="img"
              aria-label={`Scrap flow chart${selectedYear ? ` for year ${selectedYear}` : ""}`}
            >
              {hoveredSankeyLabel && (
                <div className="sankey-hover-banner">{hoveredSankeyLabel}</div>
              )}
              <ResponsiveContainer width="100%" height={500}>
                <Sankey
                  data={sankeyChartData}
                  nameKey="name"
                  nodePadding={14}
                  nodeWidth={16}
                  margin={{ top: 14, right: 24, bottom: 14, left: 12 }}
                  node={(props) => renderSankeyNode(props, setHoveredSankeyLabel)}
                  link={{ stroke: "#8fb2ff", strokeOpacity: 0.52 }}
                >
                  <Tooltip
                    content={renderSankeyTooltip}
                    cursor={{ stroke: "#bfd2ff", strokeOpacity: 0.35 }}
                  />
                </Sankey>
              </ResponsiveContainer>
            </div>
          ) : (
            !sankeyLoading && (
              <div style={{ color: "var(--text-muted)", fontSize: ".88rem" }}>
                No Sankey data available — BOM data may not be linked to these materials.
              </div>
            )
          )}
        </div>
      )}

      {/* Scrap stats table */}
      {hasData && (
        <div className="card" style={{ marginTop: "1rem" }}>
          <h3 style={{ marginBottom: ".8rem" }}>
            Scrap by Material
            {selectedYear && <span style={{ marginLeft: ".6rem", fontSize: ".8rem", color: "var(--text-muted)", fontWeight: 400 }}>{selectedYear}</span>}
          </h3>
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
